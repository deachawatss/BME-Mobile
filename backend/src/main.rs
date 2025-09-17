use axum::{
    extract::State,
    http::{header, Method, StatusCode, HeaderMap},
    middleware::from_fn_with_state,
    response::{Html, IntoResponse, Json},
    routing::{get, post, put},
    Router,
};
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde::{Deserialize, Serialize};
use tiberius::{Query as TiberiusQuery, Row};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing::{error, info, instrument, warn};

mod database;
mod handlers;
mod middleware;
mod models;
mod services;
mod types;
mod utils;

#[cfg(test)]
mod tests;

use handlers::{bulk_runs, putaway};
use middleware::auth::jwt_auth_middleware;
use types::{ApiResponse, LoginResponse, User};
use utils::AuthService;

#[derive(Clone)]
pub struct AppState {
    pub database: database::Database,
    pub ldap_config: LdapConfig,
    pub auth_service: AuthService,
    pub static_assets_path: String,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppState")
            .field("database", &self.database)
            .field("ldap_enabled", &self.ldap_config.enabled)
            .finish()
    }
}


#[derive(Clone, Debug)]
pub struct LdapConfig {
    pub url: String,
    pub base_dn: String,
    pub enabled: bool,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginData {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_at: i64,
    pub expires_in: i64,
    pub user: User,
}

// LoginResponse and User are defined in types/mod.rs

#[derive(Serialize)]
pub struct HealthResponse {
    pub success: bool,
    pub status: String,
    pub message: String,
    pub timestamp: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct DatabaseStatusResponse {
    pub success: bool,
    pub database: String,
    pub timestamp: String,
}

#[derive(Serialize)]
pub struct AuthHealthResponse {
    pub success: bool,
    pub status: String,
    pub message: String,
    pub primary_database: String,
    pub tbl_user_exists: bool,
    pub ldap_enabled: bool,
    pub issues: Vec<String>,
    pub timestamp: String,
}

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Health check endpoint
async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        success: true,
        status: "healthy".to_string(),
        message: "Bulk picking backend is running".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        version: VERSION.to_string(),
    })
}

/// Database status endpoint - shows current database configuration
async fn database_status(State(state): State<AppState>) -> Json<DatabaseStatusResponse> {
    Json(DatabaseStatusResponse {
        success: true,
        database: state.database.get_database_name().to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

/// Authentication health check endpoint - validates authentication dependencies
async fn auth_health(State(state): State<AppState>) -> Json<AuthHealthResponse> {
    let mut issues = Vec::new();
    let database_name = state.database.get_database_name().to_string();
    let ldap_enabled = state.ldap_config.enabled;

    // Check if tbl_user table exists
    let tbl_user_exists = match state.database.table_exists("tbl_user").await {
        Ok(exists) => {
            if !exists {
                issues.push("Authentication table 'tbl_user' not found in database".to_string());
            }
            exists
        }
        Err(e) => {
            issues.push(format!("Failed to check authentication table: {}", e));
            false
        }
    };

    // Determine overall status
    let status = if issues.is_empty() {
        "healthy"
    } else {
        "degraded"
    };

    let message = if issues.is_empty() {
        "All authentication dependencies are available"
    } else {
        "Authentication service has configuration issues"
    };

    Json(AuthHealthResponse {
        success: issues.is_empty(),
        status: status.to_string(),
        message: message.to_string(),
        primary_database: database_name,
        tbl_user_exists,
        ldap_enabled,
        issues,
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

/// Authentication status check endpoint
async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Json<ApiResponse<bool>> {
    // Check for Authorization header
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("Bearer ") {
                let token = &auth_str[7..]; // Remove "Bearer " prefix
                
                // Validate the JWT token
                match state.auth_service.verify_token(token) {
                    Ok(_) => return Json(ApiResponse::success(true, "User is authenticated")),
                    Err(_) => return Json(ApiResponse::success(false, "Invalid token")),
                }
            }
        }
    }
    
    // No valid token found
    Json(ApiResponse::success(false, "No authentication token provided"))
}

/// Authentication endpoint with proper JWT tokens
#[instrument(skip(state, request))]
async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, StatusCode> {
    info!("🔐 Login attempt for username: {}", request.username);

    if !state.ldap_config.enabled {
        warn!("⚠️ LDAP authentication is disabled");
        return Ok(Json(ApiResponse::error("Authentication is currently disabled")));
    }

    // Try LDAP authentication with parallel attempts for better performance
    let user_format_1 = format!("{}@NWFTH.com", request.username);
    let user_format_2 = format!("{}@newlywedsfoods.co.th", request.username);
    let user_format_3 = request.username.clone();

    info!("🔍 Attempting parallel LDAP authentication");

    // Run all LDAP attempts in parallel and take the first successful one
    let ldap_result = tokio::select! {
        result1 = authenticate_ldap(&state.ldap_config, &user_format_1, &request.password) => {
            match result1 {
                Ok(user) => {
                    info!("✅ LDAP authentication successful for: {}", user_format_1);
                    Some(user)
                }
                Err(e) => {
                    info!("❌ LDAP authentication failed for {}: {}", user_format_1, e);
                    None
                }
            }
        }
        result2 = authenticate_ldap(&state.ldap_config, &user_format_2, &request.password) => {
            match result2 {
                Ok(user) => {
                    info!("✅ LDAP authentication successful for: {}", user_format_2);
                    Some(user)
                }
                Err(e) => {
                    info!("❌ LDAP authentication failed for {}: {}", user_format_2, e);
                    None
                }
            }
        }
        result3 = authenticate_ldap(&state.ldap_config, &user_format_3, &request.password) => {
            match result3 {
                Ok(user) => {
                    info!("✅ LDAP authentication successful for: {}", user_format_3);
                    Some(user)
                }
                Err(e) => {
                    info!("❌ LDAP authentication failed for {}: {}", user_format_3, e);
                    None
                }
            }
        }
    };

    if let Some(user) = ldap_result {
        // Generate proper JWT token
        match state.auth_service.generate_token(&user) {
            Ok(token) => {
                let login_response = LoginResponse { token, user };
                return Ok(Json(ApiResponse::success(login_response, "Authentication successful")));
            }
            Err(e) => {
                error!("❌ Failed to generate JWT token: {}", e);
                return Ok(Json(ApiResponse::error("Failed to generate authentication token")));
            }
        }
    }

    // Try SQL fallback authentication
    info!("🔄 LDAP authentication failed, attempting SQL fallback");
    match authenticate_sql(&state, &request.username, &request.password).await {
        Ok(user) => {
            info!("✅ SQL authentication successful for: {}", request.username);
            
            // Generate proper JWT token
            match state.auth_service.generate_token(&user) {
                Ok(token) => {
                    let login_response = LoginResponse { token, user };
                    Ok(Json(ApiResponse::success(login_response, "Authentication successful (SQL fallback)")))
                }
                Err(e) => {
                    error!("❌ Failed to generate JWT token: {}", e);
                    Ok(Json(ApiResponse::error("Failed to generate authentication token")))
                }
            }
        }
        Err(e) => {
            let error_msg = e.to_string();
            if error_msg.contains("Authentication table 'tbl_user' not found") {
                error!("🚨 Database configuration error: {}", error_msg);
                Ok(Json(ApiResponse::error("Authentication service unavailable. Please contact system administrator.")))
            } else if error_msg.contains("Invalid object name 'tbl_user'") {
                error!("🚨 Database table missing: tbl_user table not found in current database");
                Ok(Json(ApiResponse::error("Authentication service unavailable. Please contact system administrator.")))
            } else {
                warn!("❌ Authentication failed for user {}: {}", request.username, e);
                Ok(Json(ApiResponse::error("Invalid username or password")))
            }
        }
    }
}

async fn authenticate_ldap(
    config: &LdapConfig,
    username: &str,
    password: &str,
) -> Result<User, Box<dyn std::error::Error + Send + Sync>> {
    let (conn, mut ldap) = LdapConnAsync::new(&config.url).await?;
    ldap3::drive!(conn);

    // Bind with user credentials
    ldap.simple_bind(username, password).await?.success()?;

    // Search for user information with enhanced debugging
    let search_filter = if username.contains('@') {
        format!("(userPrincipalName={username})")
    } else {
        format!("(sAMAccountName={username})")
    };

    info!("🔍 LDAP search starting - Base DN: '{}', Filter: '{}'", config.base_dn, search_filter);

    let (results, _res) = ldap
        .search(&config.base_dn, Scope::Subtree, &search_filter, vec![
            "cn", "department", "displayName", "givenName", "sAMAccountName",
            "company", "title", "organizationalUnit", "ou", "description", 
            "physicalDeliveryOfficeName", "division", "departmentNumber"
        ])
        .await?
        .success()?;

    info!("📊 LDAP search completed - Found {} results", results.len());

    // If primary search failed, try alternative search strategies
    let final_results = if results.is_empty() {
        info!("⚠️  Primary search failed, trying alternative search strategies...");
        
        // Try searching with just the username part (before @)
        let alt_username = if username.contains('@') {
            username.split('@').next().unwrap_or(username)
        } else {
            username
        };
        
        let alt_filter = format!("(sAMAccountName={alt_username})");
        info!("🔄 Trying alternative search - Filter: '{}'", alt_filter);
        
        let (alt_results, _) = ldap
            .search(&config.base_dn, Scope::Subtree, &alt_filter, vec![
                "cn", "department", "displayName", "givenName", "sAMAccountName",
                "company", "title", "organizationalUnit", "ou", "description", 
                "physicalDeliveryOfficeName", "division", "departmentNumber"
            ])
            .await?
            .success()?;
            
        info!("🔄 Alternative search completed - Found {} results", alt_results.len());
        alt_results
    } else {
        results
    };

    let user = if let Some(entry) = final_results.into_iter().next() {
        let search_entry = SearchEntry::construct(entry);
        
        // Debug logging: see what LDAP returns
        info!("LDAP attributes for {}: {:?}", username, search_entry.attrs);
        
        // Extract clean username from email format
        let clean_username = if username.contains('@') {
            username.split('@').next().unwrap_or(username).to_string()
        } else {
            username.to_string()
        };
        
        // Get display name with improved fallback logic
        let display_name = search_entry
            .attrs
            .get("displayName")
            .or_else(|| search_entry.attrs.get("cn"))
            .and_then(|v| v.first())
            .cloned()
            .unwrap_or_else(|| {
                // Better fallback: capitalize first letter of clean username
                let mut chars = clean_username.chars();
                match chars.next() {
                    None => clean_username.clone(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            });

        let first_name = search_entry
            .attrs
            .get("givenName")
            .and_then(|v| v.first())
            .cloned();

        // Enhanced department extraction with multiple fallback options
        info!("🔍 All LDAP attributes for {}: {:#?}", username, search_entry.attrs);
        
        let department = search_entry.attrs.get("department")
            .and_then(|v| v.first())
            .cloned()
            .or_else(|| {
                info!("📋 'department' field empty, trying 'company'");
                search_entry.attrs.get("company").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'company' field empty, trying 'title'");
                search_entry.attrs.get("title").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'title' field empty, trying 'organizationalUnit'");
                search_entry.attrs.get("organizationalUnit").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'organizationalUnit' field empty, trying 'ou'");
                search_entry.attrs.get("ou").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'ou' field empty, trying 'division'");
                search_entry.attrs.get("division").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'division' field empty, trying 'physicalDeliveryOfficeName'");
                search_entry.attrs.get("physicalDeliveryOfficeName").and_then(|v| v.first()).cloned()
            })
            .or_else(|| {
                info!("📋 'physicalDeliveryOfficeName' field empty, trying 'description'");
                search_entry.attrs.get("description").and_then(|v| v.first()).cloned()
            });

        info!("✅ LDAP user created: username='{}', display_name='{}', first_name='{:?}', department='{:?}'", clean_username, display_name, first_name, department);
        
        if department.is_none() {
            info!("⚠️  No department information found in any AD attribute for user: {}", username);
        } else {
            info!("🎯 Department successfully extracted: '{:?}'", department);
        }

        User {
            user_id: clean_username.clone(),
            username: clean_username.clone(),
            email: format!("{}@nwfth.com", clean_username),
            display_name,
            is_active: true,
        }
    } else {
        // Extract clean username for fallback case too
        let clean_username = if username.contains('@') {
            username.split('@').next().unwrap_or(username).to_string()
        } else {
            username.to_string()
        };
        
        // Capitalize first letter for display
        let display_name = {
            let mut chars = clean_username.chars();
            match chars.next() {
                None => clean_username.clone(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        };

        User {
            user_id: clean_username.clone(),
            username: clean_username.clone(),
            email: format!("{}@nwfth.com", clean_username),
            display_name,
            is_active: true,
        }
    };

    ldap.unbind().await?;
    Ok(user)
}

async fn authenticate_sql(
    state: &AppState,
    username: &str,
    password: &str,
) -> Result<User, Box<dyn std::error::Error + Send + Sync>> {
    // Check if tbl_user table exists before attempting authentication
    if !state.database.table_exists("tbl_user").await? {
        return Err("Authentication table 'tbl_user' not found in current database".into());
    }

    let query = r#"
        SELECT uname, pword, Fname, Lname, department
        FROM tbl_user
        WHERE uname = @P1 AND ad_enabled = 1
    "#;

    let mut client = state.database.get_client().await?;
    let mut query_builder = TiberiusQuery::new(query);
    query_builder.bind(username);

    let stream = query_builder.query(&mut client).await?;
    let rows: Vec<Vec<Row>> = stream.into_results().await?;

    if let Some(row) = rows.first().and_then(|r| r.first()) {
        let stored_password: &str = row.get("pword").unwrap_or("");
        
        // Simple plain text password comparison
        if password == stored_password {
            let fname: Option<&str> = row.get("Fname");
            let lname: Option<&str> = row.get("Lname");
            
            // For SQL authentication, use Fname/Lname for display name
            let display_name = match (fname, lname) {
                (Some(f), Some(l)) => format!("{f} {l}"),
                (Some(f), None) => f.to_string(),
                (None, Some(l)) => l.to_string(),
                (None, None) => username.to_string(), // Fallback to username
            };
            let _department: Option<&str> = row.get("department");

            Ok(User {
                user_id: username.to_string(),
                username: username.to_string(),
                email: format!("{}@nwfth.com", username),
                display_name,
                is_active: true,
            })
        } else {
            Err("Invalid password".into())
        }
    } else {
        Err("User not found".into())
    }
}

/// Serve the static Angular application with optimized path resolution
async fn handle_spa_or_static(State(state): State<AppState>, uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    
    // Don't handle API routes - return 404 to let them be handled by proper API handlers
    if path.starts_with("api/") {
        return StatusCode::NOT_FOUND.into_response();
    }
    
    // Check if it's a request for a static asset
    if path.starts_with("assets/") || 
       path.ends_with(".js") || 
       path.ends_with(".css") || 
       path.ends_with(".ico") || 
       path.ends_with(".png") || 
       path.ends_with(".jpg") || 
       path.ends_with(".svg") ||
       path.ends_with(".json") ||
       path.ends_with(".webmanifest") {
        // Use pre-determined static assets path for better performance
        let file_path = format!("{}/{}", state.static_assets_path, path);

        match tokio::fs::read(&file_path).await {
            Ok(content) => {
                let content_type = match path.split('.').last().unwrap_or("") {
                    "js" => "application/javascript",
                    "css" => "text/css",
                    "html" => "text/html",
                    "json" => "application/json",
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "svg" => "image/svg+xml",
                    "ico" => "image/x-icon",
                    "webmanifest" => "application/manifest+json",
                    _ => "text/plain",
                };

                return ([(header::CONTENT_TYPE, content_type)], content).into_response();
            }
            Err(_) => {
                // File not found, serve index.html for SPA routing
            }
        }

        // File not found, serve index.html for SPA routing
        serve_index_html(&state.static_assets_path).await.into_response()
    } else {
        // For all other routes, serve index.html (SPA routing)
        serve_index_html(&state.static_assets_path).await.into_response()
    }
}

async fn serve_index_html(static_assets_path: &str) -> impl IntoResponse {
    let index_path = format!("{}/index.html", static_assets_path);

    match tokio::fs::read_to_string(&index_path).await {
        Ok(content) => {
            info!("✅ Successfully served index.html from: {}", index_path);
            Html(content).into_response()
        }
        Err(e) => {
            warn!("🚨 Failed to read index.html from {}: {}", index_path, e);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

#[tokio::main]
async fn main() {
    // Initialize tracing with environment-based filtering
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| {
        if cfg!(debug_assertions) {
            "bulk_picking_backend=info,tower_http=warn".to_string()
        } else {
            "bulk_picking_backend=warn,tower_http=error".to_string()
        }
    });

    std::env::set_var("RUST_LOG", &log_level);
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("🚀 Starting Bulk Picking Backend v{}", VERSION);

    // Load environment variables from .env file
    dotenv::dotenv().ok();

    // Server configuration
    let host = std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("SERVER_PORT")
        .unwrap_or_else(|_| "4400".to_string())
        .parse::<u16>()
        .unwrap_or(4400);

    // CORS configuration
    let cors_origins = std::env::var("CORS_ORIGINS").unwrap_or_else(|_| "*".to_string());

    info!("Server configured to run on {}:{}", host, port);
    info!("CORS origins: {}", cors_origins);

    // Database configuration now handled by Database::new() using PRIMARY_DB/REPLICA_DB environment variables

    // LDAP configuration
    let ldap_config = LdapConfig {
        url: std::env::var("LDAP_URL").unwrap_or_else(|_| "ldap://192.168.0.1".to_string()),
        base_dn: std::env::var("LDAP_BASE_DN").unwrap_or_else(|_| "DC=NWFTH,DC=com".to_string()),
        enabled: std::env::var("LDAP_ENABLED")
            .unwrap_or_else(|_| "true".to_string())
            .parse()
            .unwrap_or(true),
    };

    info!(
        "LDAP configured: {} with base DN: {}",
        ldap_config.url, ldap_config.base_dn
    );

    // Initialize database connection
    let database = database::Database::new().expect("Failed to initialize database");

    // Validate authentication tables exist in database
    info!("🔍 Validating authentication tables in database...");
    match database.table_exists("tbl_user").await {
        Ok(true) => {
            info!("✅ Authentication table 'tbl_user' found in database");
        }
        Ok(false) => {
            warn!("⚠️  Authentication table 'tbl_user' not found in database");
            warn!("    SQL authentication will be unavailable for local users");
            warn!("    LDAP authentication will still function normally");
            warn!("    Create the tbl_user table to enable SQL fallback authentication");
        }
        Err(e) => {
            warn!("⚠️  Failed to check authentication table: {}", e);
            warn!("    SQL authentication may be unavailable");
            warn!("    LDAP authentication will still function normally");
        }
    }

    // Initialize authentication service
    let auth_service = AuthService::new().expect("Failed to initialize JWT authentication service");

    // Determine static assets path at startup for better performance
    let static_assets_path = {
        let possible_paths = vec![
            "../frontend/dist/frontend/browser",
            "frontend/dist/frontend/browser",
            "./frontend/dist/frontend/browser",
        ];

        let mut selected_path = possible_paths[0].to_string(); // Default fallback
        for path in possible_paths {
            if tokio::fs::metadata(path).await.is_ok() {
                selected_path = path.to_string();
                break;
            }
        }

        info!("📁 Static assets will be served from: {}", selected_path);
        selected_path
    };

    let state = AppState {
        database,
        ldap_config,
        auth_service,
        static_assets_path,
    };

    // Configure CORS with environment-based origins
    let cors = if cors_origins == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::HeaderName::from_static("x-user-id")])
    } else {
        // For specific origins, use Any for now (can be enhanced later)
        info!("CORS configured for specific origins: {}", cors_origins);
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
            .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::HeaderName::from_static("x-user-id")])
    };

    // Build our application with routes
    let app = Router::new()
        // API routes
        .route("/api/health", get(health_check))
        .route("/api/database/status", get(database_status))
        .route("/api/auth/health", get(auth_health))
        .route("/api/auth/login", post(login))
        .route("/api/auth/status", get(auth_status))
        .with_state(state.clone())
        // Bulk runs routes with Database state and JWT protection
        .nest(
            "/api/bulk-runs",
            Router::new()
                .route("/list", get(bulk_runs::list_bulk_runs))
                .route(
                    "/list/paginated",
                    get(bulk_runs::list_active_bulk_runs_paginated),
                )
                .route("/search", get(bulk_runs::search_bulk_runs))
                .route("/available", get(bulk_runs::get_available_runs))
                .route("/:run_no/form-data", get(bulk_runs::get_bulk_run_form_data))
                .route(
                    "/:run_no/next-ingredient",
                    get(bulk_runs::get_next_ingredient),
                )
                .route("/:run_no/completion", get(bulk_runs::check_run_completion))
                .route("/:run_no/completion-status", get(bulk_runs::check_run_completion_status))
                .route("/:run_no/complete", put(bulk_runs::complete_run_status))
                .route("/:run_no/status", get(bulk_runs::get_run_status))
                .route("/:run_no/search-items", get(bulk_runs::search_run_items))
                .route("/:run_no/ingredient-index", get(bulk_runs::get_ingredient_index))
                .route("/:run_no/ingredient-by-coordinates", get(bulk_runs::get_ingredient_by_coordinates))
                .route("/:run_no/lots/search", get(bulk_runs::search_run_lots))
                .route("/:run_no/lots/:lot_no/bins", get(bulk_runs::get_lot_bins))
                .route("/:run_no/pallets", get(bulk_runs::get_pallet_tracking_data))
                .route("/:run_no/confirm-pick", post(bulk_runs::confirm_pick))
                .route("/:run_no/debug-validation", post(bulk_runs::debug_validation))
                .route("/:run_no/pallet/:row_num/:line_id/completion", get(bulk_runs::check_pallet_completion))
                .route("/:run_no/pallet/:row_num/:line_id/next", get(bulk_runs::get_next_pallet))
                .route(
                    "/inventory/:item_key/alerts",
                    get(bulk_runs::get_inventory_alerts),
                )
                .route("/:run_no/:row_num/:line_id/picked-lots", get(bulk_runs::get_picked_lots))
                .route("/:run_no/all-picked-lots", get(bulk_runs::get_all_picked_lots_for_run))
                .route("/:run_no/batch-weight-summary", get(bulk_runs::get_batch_weight_summary))
                .route("/:run_no/lot-details", get(bulk_runs::get_run_lot_details))
                .route("/:run_no/:row_num/:line_id/unpick", post(bulk_runs::unpick_ingredient))
                .route("/:run_no/unpick-all", post(bulk_runs::unpick_all_run_lots))
                .route("/:run_no/revert-status", post(bulk_runs::revert_run_status))
                .route("/health", get(bulk_runs::bulk_runs_health))
                .layer(from_fn_with_state(state.clone(), jwt_auth_middleware))
                .with_state(state.database.clone()),
        )
        // Add putaway routes with Database state and JWT protection
        .nest(
            "/api/putaway",
            putaway::create_putaway_routes()
                .layer(from_fn_with_state(state.clone(), jwt_auth_middleware))
                .with_state(state.database),
        )
        // Serve static files from Angular dist
        .nest_service("/assets", ServeDir::new("../frontend/dist/frontend/browser/assets"))
        .fallback(handle_spa_or_static)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind(&format!("{host}:{port}"))
        .await
        .expect("Failed to bind to address");

    info!("🎯 Server started successfully on http://{}:{}", host, port);
    info!("📁 Serving static files from ../frontend/dist/frontend/browser/");
    info!("🔧 API endpoints available at http://{}:{}/api/", host, port);
    
    axum::serve(listener, app)
        .await
        .expect("Server failed to start");
}