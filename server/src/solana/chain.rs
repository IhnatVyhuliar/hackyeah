//! Minimal Solana JSON-RPC reader for the unbox_escrow program.
use anchor_lang::prelude::Pubkey;
use anchor_lang::Discriminator;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::time::Duration;
use unbox_escrow::state::Deal;

pub struct RpcChain {
    http: reqwest::Client,
    url: String,
}

fn base64_data(account: &Value) -> Result<Vec<u8>, String> {
    let data = account["data"][0].as_str().ok_or("account without base64 data")?;
    B64.decode(data).map_err(|e| e.to_string())
}

impl RpcChain {
    pub fn new(url: &str) -> Self {
        let http = reqwest::Client::builder().timeout(Duration::from_secs(10)).build().expect("http client");
        Self { http, url: url.to_string() }
    }

    async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        let res = self.http.post(&self.url).json(&body).send().await.map_err(|e| format!("{method}: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("{method}: HTTP {}", res.status()));
        }
        let mut v: Value = res.json().await.map_err(|e| format!("{method}: {e}"))?;
        if let Some(err) = v.get("error") {
            return Err(format!("{method}: {err}"));
        }
        Ok(v["result"].take())
    }

    /// Data of those `keys` that exist and are owned by the program.
    pub async fn accounts(&self, keys: &[Pubkey]) -> Result<Vec<(Pubkey, Vec<u8>)>, String> {
        let program = unbox_escrow::ID.to_string();
        let mut out = Vec::new();
        for chunk in keys.chunks(100) {
            let ids: Vec<String> = chunk.iter().map(Pubkey::to_string).collect();
            let result = self
                .call("getMultipleAccounts", json!([ids, { "encoding": "base64", "commitment": "confirmed" }]))
                .await?;
            let values = result["value"].as_array().ok_or("getMultipleAccounts without value")?;
            for (key, account) in chunk.iter().zip(values) {
                if account["owner"].as_str() == Some(program.as_str()) {
                    out.push((*key, base64_data(account)?));
                }
            }
        }
        Ok(out)
    }

    /// Every account of the program that starts with the Deal discriminator.
    pub async fn all_deals(&self) -> Result<Vec<(Pubkey, Vec<u8>)>, String> {
        let filter =
            json!({ "memcmp": { "offset": 0, "bytes": B64.encode(Deal::DISCRIMINATOR), "encoding": "base64" } });
        let params = json!([unbox_escrow::ID.to_string(),
                            { "encoding": "base64", "commitment": "confirmed", "filters": [filter] }]);
        let result = self.call("getProgramAccounts", params).await?;
        result
            .as_array()
            .ok_or("getProgramAccounts did not return an array")?
            .iter()
            .map(|item| {
                let key = item["pubkey"].as_str().ok_or("item without pubkey")?;
                let key: Pubkey = key.parse().map_err(|_| format!("bad pubkey {key}"))?;
                Ok((key, base64_data(&item["account"])?))
            })
            .collect()
    }

    /// Newest transaction touching `key`, for the Explorer link.
    pub async fn latest_signature(&self, key: &Pubkey) -> Result<Option<String>, String> {
        let result = self
            .call("getSignaturesForAddress", json!([key.to_string(), { "limit": 1, "commitment": "confirmed" }]))
            .await?;
        Ok(result[0]["signature"].as_str().map(str::to_string))
    }

    pub async fn balance(&self, key: &Pubkey) -> Result<u64, String> {
        let result = self.call("getBalance", json!([key.to_string(), { "commitment": "confirmed" }])).await?;
        result["value"].as_u64().ok_or_else(|| "getBalance without value".to_string())
    }
}
