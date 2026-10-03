//! JWT (HS256) + bcrypt. Ekstraktor `AuthUser` dla tras wymagających logowania.

use crate::db;
use crate::error::ApiError;
use crate::model::User;
use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    iat: i64,
    exp: i64,
}

const TOKEN_TTL_SECS: i64 = 7 * 86400;
pub const BCRYPT_COST: u32 = 10;

pub fn sign_token(state: &AppState, user_id: &str) -> String {
    // Ważność liczona od zegara systemowego (nie od zegara testowego transakcji).
    let iat = crate::state::unix_now();
    let claims = Claims { sub: user_id.to_string(), iat, exp: iat + TOKEN_TTL_SECS };
    encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(state.cfg.jwt_secret.as_bytes()))
        .expect("podpis JWT")
}

pub async fn hash_password(pw: String) -> Result<String, ApiError> {
    tokio::task::spawn_blocking(move || bcrypt::hash(pw, BCRYPT_COST))
        .await
        .map_err(|e| ApiError::internal(e.to_string()))?
        .map_err(|e| ApiError::internal(e.to_string()))
}

pub async fn check_password(pw: String, hash: String) -> bool {
    tokio::task::spawn_blocking(move || bcrypt::verify(pw, &hash).unwrap_or(false)).await.unwrap_or(false)
}

pub struct AuthUser(pub User);

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or_else(|| ApiError::unauthorized("Brak tokenu"))?;
        let invalid = || ApiError::unauthorized("Nieprawidłowy albo wygasły token");
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.cfg.jwt_secret.as_bytes()),
            &Validation::new(Algorithm::HS256),
        )
        .map_err(|_| invalid())?;
        let user = db::user_by_id(&state.conn(), &data.claims.sub)?.ok_or_else(invalid)?;
        Ok(AuthUser(user))
    }
}
