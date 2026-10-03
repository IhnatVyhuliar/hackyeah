mod common;

use common::fake_rpc::FakeRpc;
use common::*;
use reqwest::{Method, StatusCode};
use anchor_lang::prelude::Pubkey;
use serde_json::json;
use sha2::{Digest, Sha256};

pub const ARBITER: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";

/// Backend in PAYMENTS=solana against the fake RPC. A long poll interval keeps webhook tests honest.
async fn solana_backend(rpc: &FakeRpc, poll_ms: &str) -> Backend {
    Backend::start(&[
        ("PAYMENTS", "solana"),
        ("RPC_URL", rpc.url.as_str()),
        ("ARBITER_PUBKEY", ARBITER),
        ("WEBHOOK_SECRET", "s3cret"),
        ("SOLANA_POLL_MS", poll_ms),
    ])
    .await
}

#[tokio::test]
async fn solana_mode_requires_arbiter() {
    let err = Backend::try_start(&[("PAYMENTS", "solana")]).await.err().expect("must not start without ARBITER_PUBKEY");
    assert!(err.contains("ARBITER_PUBKEY"), "{err}");
}

#[tokio::test]
async fn health_reports_solana_mode() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let (s, v) = b.anon().call(Method::GET, "/api/health", None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["payments"], "solana");
    assert_eq!(v["timeouts"], "demo");
    assert_eq!(v["chain"]["programId"], unbox_escrow::ID.to_string());
    assert_eq!(v["chain"]["arbiter"], ARBITER);
}

pub fn random_key() -> Pubkey {
    Pubkey::new_from_array(rand::random())
}

pub async fn linked(b: &Backend, email: &str, wallet: &Pubkey) -> Api {
    let a = b.login(email).await;
    let (s, v) = a.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": wallet.to_string() }))).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    a
}

#[tokio::test]
async fn seed_is_in_sol_and_unpublished_listings_are_hidden() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let (_, browse) = b.anon().call(Method::GET, "/api/listings", None).await;
    assert_eq!(browse, json!([]));
    let ania = b.login("ania@demo.pl").await;
    let (_, mine) = ania.call(Method::GET, "/api/me/listings", None).await;
    let kurtka = mine.as_array().unwrap().iter().find(|l| l["id"] == "l-kurtka-levis").unwrap().clone();
    assert_eq!((kurtka["currency"].clone(), kurtka["priceMinor"].clone()), (json!("SOL"), json!(60_000_000)));
}

#[tokio::test]
async fn publish_returns_create_listing_args_and_serves_hashed_metadata() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let ania = b.login("ania@demo.pl").await;
    let (s, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")), "no wallet yet");

    let seller = random_key();
    let ania = linked(&b, "ania@demo.pl", &seller).await;
    let (s, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let deal_id = v["dealId"].as_u64().unwrap();
    let (pda, _) = Pubkey::find_program_address(&[b"deal", seller.as_ref(), &deal_id.to_le_bytes()], &unbox_escrow::ID);
    assert_eq!(v["deal"], pda.to_string());
    assert_eq!(v["priceLamports"], 60_000_000);
    assert_eq!(v["arbiter"], ARBITER);
    assert_eq!(v["programId"], unbox_escrow::ID.to_string());
    let uri = v["metadataUri"].as_str().unwrap().to_string();
    assert_eq!(uri, format!("{}/api/listings/l-kurtka-levis/metadata.json", b.url));
    let bytes = reqwest::get(&uri).await.unwrap().bytes().await.unwrap();
    assert_eq!(hex::encode(Sha256::digest(&bytes)), v["listingHash"].as_str().unwrap());

    let (_, again) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    assert_eq!(again["deal"], v["deal"], "publish is idempotent");
    let bartek = linked(&b, "bartek@demo.pl", &random_key()).await;
    assert_eq!(bartek.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn publish_freezes_listing() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let ania = linked(&b, "ania@demo.pl", &random_key()).await;
    let (_, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    let (s, e) = ania.call(Method::PATCH, "/api/listings/l-kurtka-levis", Some(json!({ "title": "Inna kurtka" }))).await;
    assert_eq!((s, e["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let bytes = reqwest::get(v["metadataUri"].as_str().unwrap()).await.unwrap().bytes().await.unwrap();
    assert_eq!(hex::encode(Sha256::digest(&bytes)), v["listingHash"].as_str().unwrap());
}

#[tokio::test]
async fn legacy_actions_rejected_in_solana_mode() {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, "600000").await;
    let bartek = b.login("bartek@demo.pl").await;
    let (s, v) = bartek.call(Method::POST, "/api/listings/l-sukienka-zara/purchase", None).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let (_, l) = b.anon().call(Method::GET, "/api/listings/l-sukienka-zara", None).await;
    assert_eq!(l["status"], "Listed");
    for action in ["ship", "accept", "dispute", "return", "confirm-return", "settle"] {
        let (s, _) = bartek.call(Method::POST, &format!("/api/deals/l-sukienka-zara/{action}"), Some(json!({}))).await;
        assert_eq!(s, StatusCode::CONFLICT, "{action}");
    }
}