//! Błędy API: zawsze `{ "error": { "code", "message" } }`, komunikaty po polsku.

use crate::machine::{DealError, DealErrorCode};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self { status, code, message: message.into() }
    }
    pub fn validation(m: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "VALIDATION", m)
    }
    pub fn too_large(m: impl Into<String>) -> Self {
        Self::new(StatusCode::PAYLOAD_TOO_LARGE, "VALIDATION", m)
    }
    pub fn unauthorized(m: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", m)
    }
    pub fn forbidden(m: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "FORBIDDEN", m)
    }
    pub fn not_found(m: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, "NOT_FOUND", m)
    }
    pub fn invalid_state(m: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, "INVALID_STATE", m)
    }
    pub fn insufficient_funds() -> Self {
        Self::new(StatusCode::CONFLICT, "INSUFFICIENT_FUNDS", "Za mało środków na saldzie")
    }
    pub fn upstream(m: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_GATEWAY, "UPSTREAM", m)
    }
    pub fn internal(m: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL", m)
    }
}

impl From<DealError> for ApiError {
    fn from(e: DealError) -> Self {
        let (status, code) = match e.code {
            DealErrorCode::Forbidden => (StatusCode::FORBIDDEN, "FORBIDDEN"),
            DealErrorCode::InvalidState => (StatusCode::CONFLICT, "INVALID_STATE"),
            DealErrorCode::DeadlinePassed => (StatusCode::CONFLICT, "DEADLINE_PASSED"),
            DealErrorCode::DeadlineNotReached => (StatusCode::CONFLICT, "DEADLINE_NOT_REACHED"),
            DealErrorCode::QrMismatch => (StatusCode::CONFLICT, "QR_MISMATCH"),
        };
        Self::new(status, code, e.message)
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        tracing::error!("sqlite: {e}");
        Self::internal("Błąd bazy danych")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": { "code": self.code, "message": self.message } }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
