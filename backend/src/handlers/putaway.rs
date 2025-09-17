use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use std::collections::HashMap;
use serde_json::json;

use crate::database::Database;
use crate::services::{
    PutawayService, LotSearchResult, BinValidationResult, 
    BinTransferRequest, TransferResult, PutawayHealthResponse, PutawayError
};

/// Create putaway routes
pub fn create_putaway_routes() -> Router<Database> {
    Router::new()
        .route("/lot/{lot_no}", get(search_lot))
        .route("/lots/search", get(search_lots))
        .route("/bins/search", get(search_bins))
        .route("/bin/{location}/{bin_no}", get(validate_bin))
        .route("/transfer", post(execute_transfer))
        .route("/health", get(get_health))
}

/// Search for lot details
/// GET /api/putaway/lot/{lot_no}
async fn search_lot(
    State(database): State<Database>,
    Path(lot_no): Path<String>,
) -> Result<Json<LotSearchResult>, (StatusCode, Json<serde_json::Value>)> {
    let service = PutawayService::new(database);

    match service.search_lot(&lot_no).await {
        Ok(result) => Ok(Json(result)),
        Err(PutawayError::LotNotFound { lot_no }) => {
            Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "Lot not found",
                    "message": format!("Lot '{}' not found or has zero quantity", lot_no),
                    "lot_no": lot_no
                }))
            ))
        }
        Err(PutawayError::ValidationError(msg)) => {
            Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Validation error",
                    "message": msg
                }))
            ))
        }
        Err(PutawayError::DatabaseError(msg)) => {
            tracing::error!("Database error in search_lot: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Database error",
                    "message": "Internal server error occurred"
                }))
            ))
        }
        Err(e) => {
            tracing::error!("Unexpected error in search_lot: {e}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Internal server error",
                    "message": "An unexpected error occurred"
                }))
            ))
        }
    }
}

/// Search for lots with optional query filter and pagination
/// GET /api/putaway/lots/search?query={search_term}&page={page}&limit={limit}
async fn search_lots(
    State(database): State<Database>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let service = PutawayService::new(database);

    // Extract query parameters
    let query = params.get("query").map(|s| s.as_str());
    let page = params.get("page")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(1); // Default page 1
    let limit = params.get("limit")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(20); // Default limit

    match service.search_lots_paginated(query, page, limit).await {
        Ok((lots, total)) => {
            let total_pages = ((total as f64) / (limit as f64)).ceil() as i32;
            Ok(Json(json!({
                "items": lots,
                "total": total,
                "page": page,
                "pages": total_pages,
                "limit": limit
            })))
        },
        Err(PutawayError::DatabaseError(msg)) => {
            tracing::error!("Database error in search_lots: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Database error",
                    "message": format!("Database connection failed: {}", msg)
                }))
            ))
        }
        Err(e) => {
            tracing::error!("Unexpected error in search_lots: {e}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Internal server error",
                    "message": "An unexpected error occurred"
                }))
            ))
        }
    }
}

/// Search for bins with optional query filter and pagination
/// GET /api/putaway/bins/search?query={search_term}&page={page}&limit={limit}
async fn search_bins(
    State(database): State<Database>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let service = PutawayService::new(database);

    // Extract query parameters
    let query = params.get("query").map(|s| s.as_str());
    let page = params.get("page")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(1); // Default page 1
    let limit = params.get("limit")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(20); // Default limit

    match service.search_bins_paginated(query, page, limit).await {
        Ok((bins, total)) => {
            let total_pages = ((total as f64) / (limit as f64)).ceil() as i32;
            Ok(Json(json!({
                "items": bins,
                "total": total,
                "page": page,
                "pages": total_pages,
                "limit": limit
            })))
        },
        Err(PutawayError::DatabaseError(msg)) => {
            tracing::error!("Database error in search_bins: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Database error",
                    "message": format!("Database connection failed: {}", msg)
                }))
            ))
        }
        Err(e) => {
            tracing::error!("Unexpected error in search_bins: {e}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Internal server error",
                    "message": "An unexpected error occurred"
                }))
            ))
        }
    }
}

/// Validate destination bin
/// GET /api/putaway/bin/{location}/{bin_no}
async fn validate_bin(
    State(database): State<Database>,
    Path((location, bin_no)): Path<(String, String)>,
) -> Result<Json<BinValidationResult>, (StatusCode, Json<serde_json::Value>)> {
    let service = PutawayService::new(database);

    match service.validate_bin(&location, &bin_no).await {
        Ok(result) => Ok(Json(result)),
        Err(PutawayError::DatabaseError(msg)) => {
            tracing::error!("Database error in validate_bin: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Database error",
                    "message": format!("Database connection failed: {}", msg)
                }))
            ))
        }
        Err(e) => {
            tracing::error!("Unexpected error in validate_bin: {e}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Internal server error",
                    "message": "An unexpected error occurred"
                }))
            ))
        }
    }
}

/// Execute bin transfer
/// POST /api/putaway/transfer
async fn execute_transfer(
    State(database): State<Database>,
    Json(request): Json<BinTransferRequest>,
) -> Result<Json<TransferResult>, (StatusCode, Json<serde_json::Value>)> {
    let service = PutawayService::new(database);

    match service.execute_transfer(request).await {
        Ok(result) => {
            if result.success {
                Ok(Json(result))
            } else {
                Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": "Transfer failed",
                        "message": result.message,
                        "timestamp": result.timestamp
                    }))
                ))
            }
        }
        Err(PutawayError::LotNotFound { lot_no }) => {
            Err((
                StatusCode::NOT_FOUND,
                Json(json!({
                    "error": "Lot not found",
                    "message": format!("Lot '{}' not found", lot_no)
                }))
            ))
        }
        Err(PutawayError::InvalidBin { bin_no, location }) => {
            Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Invalid bin",
                    "message": format!("Bin '{}' is not valid in location '{}'", bin_no, location)
                }))
            ))
        }
        Err(PutawayError::InsufficientQuantity { requested, available }) => {
            Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Insufficient quantity",
                    "message": format!("Requested {} but only {} available", requested, available),
                    "requested": requested,
                    "available": available
                }))
            ))
        }
        Err(PutawayError::ValidationError(msg)) => {
            Err((
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "Validation error",
                    "message": msg
                }))
            ))
        }
        Err(PutawayError::TransactionError(msg)) => {
            tracing::error!("Transaction error in execute_transfer: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Transaction error",
                    "message": "Failed to complete transfer transaction"
                }))
            ))
        }
        Err(PutawayError::DatabaseError(msg)) => {
            tracing::error!("Database error in execute_transfer: {msg}");
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "error": "Database error",
                    "message": "Internal server error occurred"
                }))
            ))
        }
    }
}

/// Get service health status
/// GET /api/putaway/health
async fn get_health(
    State(database): State<Database>,
) -> Json<PutawayHealthResponse> {
    let service = PutawayService::new(database);
    Json(service.get_health().await)
}

