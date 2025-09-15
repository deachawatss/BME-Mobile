use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::error;

/// Standardized API error response structure
/// Provides consistent error messaging across all API endpoints
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    pub success: bool,
    pub error: ApiError,
    pub message: String,
    pub timestamp: String,
    pub request_id: Option<String>,
}

/// Detailed error information
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub code: String,
    pub error_type: ApiErrorType,
    pub details: Option<String>,
    pub validation_errors: Option<HashMap<String, Vec<String>>>,
    pub retry_after: Option<u32>, // seconds
}

/// API error types for proper categorization
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorType {
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFound,
    Conflict,
    DatabaseError,
    ExternalServiceError,
    InternalServerError,
    RateLimitExceeded,
    BadRequest,
}


/// Convert ApiErrorResponse to HTTP response
impl IntoResponse for ApiErrorResponse {
    fn into_response(self) -> Response {
        let status_code = match self.error.error_type {
            ApiErrorType::ValidationError => StatusCode::BAD_REQUEST,
            ApiErrorType::AuthenticationError => StatusCode::UNAUTHORIZED,
            ApiErrorType::AuthorizationError => StatusCode::FORBIDDEN,
            ApiErrorType::NotFound => StatusCode::NOT_FOUND,
            ApiErrorType::Conflict => StatusCode::CONFLICT,
            ApiErrorType::DatabaseError => StatusCode::INTERNAL_SERVER_ERROR,
            ApiErrorType::ExternalServiceError => StatusCode::BAD_GATEWAY,
            ApiErrorType::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            ApiErrorType::RateLimitExceeded => StatusCode::TOO_MANY_REQUESTS,
            ApiErrorType::BadRequest => StatusCode::BAD_REQUEST,
        };

        // Log error for monitoring
        error!(
            "API Error: {} - {} (Code: {}, Type: {:?})",
            status_code.as_u16(),
            self.message,
            self.error.code,
            self.error.error_type
        );

        (status_code, Json(self)).into_response()
    }
}

