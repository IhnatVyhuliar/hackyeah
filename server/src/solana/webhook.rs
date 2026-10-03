//! Helius webhook (accountAddresses = [PROGRAM_ID]). The payload is only a trigger: addresses of known
//! listings found in it are re-read over RPC. Nothing else in the payload is used or trusted.

use super::indexer;
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use anchor_lang::prelude::Pubkey;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderMap};
use axum::Json;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::str::FromStr;

const MAX_CANDIDATES: usize = 256;

/// Every string in the payload that parses as a 32-byte key; works for Helius raw and enhanced payloads.
pub fn candidate_keys(payload: &Value) -> Vec<Pubkey> {
    let mut found = BTreeSet::new();
    collect(payload, &mut found);
    found.into_iter().collect()
}

fn collect(value: &Value, out: &mut BTreeSet<Pubkey>) {
    if out.len() >= MAX_CANDIDATES {
        return;
    }
    match value {
        Value::String(s) if (32..=44).contains(&s.len()) => {
            if let Ok(key) = Pubkey::from_str(s) {
                out.insert(key);
            }
        }
        Value::Array(items) => items.iter().for_each(|item| collect(item, out)),
        Value::Object(map) => map.values().for_each(|item| collect(item, out)),
        _ => {}
    }
}

pub async fn helius(State(s): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult<Json<Value>> {
    let cfg = s.cfg.solana.as_ref().ok_or_else(|| ApiError::not_found("Nie ma takiego endpointu"))?;
    if let Some(secret) = &cfg.webhook_secret {
        let given = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok());
        if given != Some(secret.as_str()) {
            return Err(ApiError::unauthorized("Nieprawidłowy sekret webhooka"));
        }
    }
    let payload: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
    let known = indexer::known_addresses(&s)?;
    let keys: Vec<Pubkey> =
        candidate_keys(&payload).into_iter().filter(|k| known.contains_key(&k.to_string())).collect();
    let synced = if keys.is_empty() {
        0
    } else {
        // 502 makes Helius retry later; the poller covers the gap meanwhile.
        indexer::sync_addresses(&s, &keys).await.map_err(|e| ApiError::upstream(format!("RPC: {e}")))?
    };
    tracing::info!(synced, "helius webhook");
    Ok(Json(json!({ "synced": synced })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_keys_in_raw_and_enhanced_payloads() {
        let a = Pubkey::new_from_array([1; 32]);
        let b = Pubkey::new_from_array([2; 32]);
        let payload = json!([
            { "transaction": { "message": { "accountKeys": [a.to_string()] },
              "signatures": ["5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"] } },
            { "accountData": [{ "account": b.to_string(), "nativeBalanceChange": 0 }], "type": "UNKNOWN" }
        ]);
        let keys = candidate_keys(&payload);
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&a) && keys.contains(&b));
    }

    #[test]
    fn ignores_junk_and_caps_the_list() {
        assert!(candidate_keys(&json!({ "hello": "world", "n": 5 })).is_empty());
        assert!(candidate_keys(&Value::Null).is_empty());
        let many: Vec<String> = (0..1000u32)
            .map(|i| {
                let mut b = [0u8; 32];
                b[..4].copy_from_slice(&i.to_le_bytes());
                Pubkey::new_from_array(b).to_string()
            })
            .collect();
        assert_eq!(candidate_keys(&json!(many)).len(), MAX_CANDIDATES);
    }
}
