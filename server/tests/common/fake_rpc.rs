//! Fake Solana JSON-RPC with the methods the server uses, backed by in-memory accounts.
use anchor_lang::prelude::Pubkey;
use anchor_lang::{AccountSerialize, Discriminator};
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use unbox_escrow::state::{Deal, DealStatus, Verdict};

#[derive(Default)]
struct Inner {
    accounts: Mutex<HashMap<String, Vec<u8>>>,
    balances: Mutex<HashMap<String, u64>>,
    failing: AtomicBool,
    calls: AtomicUsize,
}

#[derive(Clone)]
pub struct FakeRpc {
    pub url: String,
    inner: Arc<Inner>,
}

impl FakeRpc {
    pub async fn start() -> FakeRpc {
        let inner = Arc::new(Inner::default());
        let app = Router::new().route("/", post(handle)).with_state(inner.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        FakeRpc { url, inner }
    }

    pub fn put_deal(&self, address: &Pubkey, deal: &Deal) {
        let mut data = Vec::new();
        deal.try_serialize(&mut data).unwrap();
        self.put_raw(address, data);
    }

    pub fn put_raw(&self, address: &Pubkey, data: Vec<u8>) {
        self.inner.accounts.lock().unwrap().insert(address.to_string(), data);
    }

    pub fn set_balance(&self, address: &str, lamports: u64) {
        self.inner.balances.lock().unwrap().insert(address.to_string(), lamports);
    }

    pub fn set_failing(&self, failing: bool) {
        self.inner.failing.store(failing, Ordering::SeqCst);
    }

    pub fn calls(&self) -> usize {
        self.inner.calls.load(Ordering::SeqCst)
    }
}

async fn handle(State(s): State<Arc<Inner>>, Json(req): Json<Value>) -> Result<Json<Value>, StatusCode> {
    s.calls.fetch_add(1, Ordering::SeqCst);
    if s.failing.load(Ordering::SeqCst) {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let owner = unbox_escrow::ID.to_string();
    let account = |data: &Vec<u8>| {
        json!({ "data": [B64.encode(data), "base64"], "owner": owner, "lamports": 1, "executable": false, "rentEpoch": 0 })
    };
    let params = &req["params"];
    let result = match req["method"].as_str().unwrap_or("") {
        "getMultipleAccounts" => {
            let accounts = s.accounts.lock().unwrap();
            let value: Vec<Value> = params[0]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|k| k.as_str().and_then(|k| accounts.get(k)).map(|d| account(d)).unwrap_or(Value::Null))
                .collect();
            json!({ "context": { "slot": 1 }, "value": value })
        }
        "getProgramAccounts" => {
            let accounts = s.accounts.lock().unwrap();
            let items: Vec<Value> = accounts
                .iter()
                .filter(|(_, d)| d.starts_with(Deal::DISCRIMINATOR))
                .map(|(k, d)| json!({ "pubkey": k, "account": account(d) }))
                .collect();
            json!(items)
        }
        "getSignaturesForAddress" => json!([{ "signature": format!("sig-{}", params[0].as_str().unwrap_or("")) }]),
        "getBalance" => {
            let lamports = s.balances.lock().unwrap().get(params[0].as_str().unwrap_or("")).copied().unwrap_or(0);
            json!({ "context": { "slot": 1 }, "value": lamports })
        }
        other => {
            return Ok(Json(json!({ "jsonrpc": "2.0", "id": req["id"].clone(),
                                   "error": { "code": -32601, "message": format!("{other} is not faked") } })))
        }
    };
    Ok(Json(json!({ "jsonrpc": "2.0", "id": req["id"].clone(), "result": result })))
}

/// An on-chain Deal as the program would store it; `listing_hash_hex` must equal the published hash.
pub fn chain_deal(seller: Pubkey, buyer: Pubkey, status: DealStatus, changed_at: i64, listing_hash_hex: &str, price: u64) -> Deal {
    Deal {
        seller,
        buyer,
        arbiter: "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw".parse().unwrap(),
        deal_id: 1,
        price_lamports: price,
        listing_hash: hex::decode(listing_hash_hex).unwrap().try_into().unwrap(),
        status,
        status_changed_at: changed_at,
        qr_commitment: [0; 32],
        packing_video_hash: [0; 32],
        unboxing_video_hash: [0; 32],
        complaint_hash: [0; 32],
        verdict: Verdict::None,
        report_hash: [0; 32],
        return_qr_commitment: [0; 32],
        return_video_hash: [0; 32],
        bump: 255,
        metadata_uri: "http://localhost/api/listings/x/metadata.json".into(),
        tracking_number: String::new(),
        return_tracking_number: String::new(),
    }
}
