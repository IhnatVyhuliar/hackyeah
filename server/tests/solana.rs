mod common;

use common::fake_rpc::FakeRpc;
use common::*;
use reqwest::{Method, StatusCode};
use anchor_lang::prelude::Pubkey;
use serde_json::{json, Value};
use common::fake_rpc::chain_deal;
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus};
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

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn raw_payload(address: &Pubkey) -> Value {
    json!([{ "slot": 1, "meta": { "err": null },
             "transaction": { "message": { "accountKeys": [address.to_string(), unbox_escrow::ID.to_string(),
                                                           "11111111111111111111111111111111"] },
                              "signatures": ["5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"] } }])
}

/// Ania (wallet linked) has published the jacket and Bartek has linked his wallet; nothing is on-chain yet.
struct Market {
    b: Backend,
    rpc: FakeRpc,
    ania: Api,
    bartek: Api,
    seller: Pubkey,
    buyer: Pubkey,
    deal: Pubkey,
    hash: String,
}

async fn market(poll_ms: &str) -> Market {
    let rpc = FakeRpc::start().await;
    let b = solana_backend(&rpc, poll_ms).await;
    let (seller, buyer) = (random_key(), random_key());
    let ania = linked(&b, "ania@demo.pl", &seller).await;
    let bartek = linked(&b, "bartek@demo.pl", &buyer).await;
    let (_, v) = ania.call(Method::POST, "/api/listings/l-kurtka-levis/publish", None).await;
    let deal = Pubkey::from_str(v["deal"].as_str().unwrap()).unwrap();
    let hash = v["listingHash"].as_str().unwrap().to_string();
    Market { b, rpc, ania, bartek, seller, buyer, deal, hash }
}

impl Market {
    fn chain(&self, status: ChainStatus, at: i64) -> ChainDeal {
        chain_deal(self.seller, self.buyer, status, at, &self.hash, 60_000_000)
    }

    async fn webhook(&self, payload: Value, secret: Option<&str>) -> (StatusCode, Value) {
        let mut req = reqwest::Client::new().post(format!("{}/api/webhooks/helius", self.b.url)).json(&payload);
        if let Some(s) = secret {
            req = req.header("authorization", s);
        }
        let res = req.send().await.unwrap();
        let status = res.status();
        (status, res.json().await.unwrap_or(Value::Null))
    }

    async fn notify(&self) -> Value {
        let (s, v) = self.webhook(raw_payload(&self.deal), Some("s3cret")).await;
        assert_eq!(s, StatusCode::OK, "{v}");
        v
    }
}

#[tokio::test]
async fn webhook_publishes_listing_into_browse() {
    let m = market("600000").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    assert_eq!(m.notify().await["synced"], 1);
    let (_, browse) = m.b.anon().call(Method::GET, "/api/listings", None).await;
    let ids: Vec<Value> = browse.as_array().unwrap().iter().map(|l| l["id"].clone()).collect();
    assert_eq!(ids, [json!("l-kurtka-levis")]);
}

#[tokio::test]
async fn on_chain_purchase_ship_accept_is_mirrored() {
    let m = market("600000").await;
    let t = now();
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, t));
    m.notify().await;
    let (_, deals) = m.bartek.call(Method::GET, "/api/deals?role=buyer", None).await;
    let d = &deals[0];
    assert_eq!((d["status"].clone(), d["payment"]["status"].clone()), (json!("Paid"), json!("secured")));
    assert_eq!((d["payment"]["amountMinor"].clone(), d["payment"]["currency"].clone()), (json!(60_000_000), json!("SOL")));
    assert_eq!(d["buyer"]["id"], "u-bartek");
    let (_, l) = m.b.anon().call(Method::GET, "/api/listings/l-kurtka-levis", None).await;
    assert_eq!(l["status"], "Sold");

    let mut shipped = m.chain(ChainStatus::Shipped, t + 5);
    shipped.tracking_number = "INPOST-1".into();
    shipped.qr_commitment = [0xab; 32];
    m.rpc.put_deal(&m.deal, &shipped);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["status"].clone(), d["trackingNumber"].clone()), (json!("Shipped"), json!("INPOST-1")));

    let mut done = shipped.clone();
    done.status = ChainStatus::Completed;
    done.status_changed_at = t + 10;
    m.rpc.put_deal(&m.deal, &done);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["payment"]["status"].clone(), d["closeReason"].clone()), (json!("released"), json!("accepted")));
    let kinds: Vec<Value> = d["timeline"].as_array().unwrap().iter().map(|e| e["type"].clone()).collect();
    assert_eq!(kinds, [json!("paid"), json!("shipped"), json!("completed")]);
    let explorer = d["onchain"]["transactions"][2]["explorerUrl"].as_str().unwrap().to_string();
    assert!(explorer.contains(&format!("sig-{}", m.deal)) && explorer.contains("cluster=devnet"), "{explorer}");
}

#[tokio::test]
async fn webhook_is_idempotent_and_authenticated() {
    let m = market("600000").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    assert_eq!(m.webhook(raw_payload(&m.deal), None).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(m.webhook(raw_payload(&m.deal), Some("wrong")).await.0, StatusCode::UNAUTHORIZED);
    m.notify().await;
    m.notify().await; // Helius retry
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!(d["timeline"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn webhook_ignores_junk_without_rpc_and_reports_rpc_failure() {
    let m = market("600000").await;
    let before = m.rpc.calls();
    for junk in [json!("not an array"), json!({ "hello": "world" }), raw_payload(&random_key())] {
        assert_eq!(m.webhook(junk, Some("s3cret")).await, (StatusCode::OK, json!({ "synced": 0 })));
    }
    assert_eq!(m.rpc.calls(), before, "junk must not reach RPC");
    m.rpc.set_failing(true);
    assert_eq!(m.webhook(raw_payload(&m.deal), Some("s3cret")).await.0, StatusCode::BAD_GATEWAY);
}

#[tokio::test]
async fn mismatched_listing_hash_is_not_mirrored() {
    let m = market("600000").await;
    let mut forged = m.chain(ChainStatus::Listed, now());
    forged.listing_hash = [9; 32];
    m.rpc.put_deal(&m.deal, &forged);
    m.notify().await;
    let (_, browse) = m.b.anon().call(Method::GET, "/api/listings", None).await;
    assert_eq!(browse, json!([]));
    forged.status = ChainStatus::Paid;
    m.rpc.put_deal(&m.deal, &forged);
    m.notify().await;
    let (_, deals) = m.ania.call(Method::GET, "/api/deals?role=seller", None).await;
    assert_eq!(deals, json!([]));
}

#[tokio::test]
async fn ignores_unknown_and_undecodable_accounts() {
    let m = market("600000").await;
    let mut garbage = <ChainDeal as anchor_lang::Discriminator>::DISCRIMINATOR.to_vec();
    garbage.extend_from_slice(&[1, 2, 3]);
    m.rpc.put_raw(&m.deal, garbage);
    assert_eq!(m.notify().await["synced"], 0);
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    assert_eq!(m.notify().await["synced"], 1);
}

#[tokio::test]
async fn unknown_buyer_wallet_still_mirrored() {
    let m = market("600000").await;
    let stranger = random_key();
    let mut paid = m.chain(ChainStatus::Paid, now());
    paid.buyer = stranger;
    m.rpc.put_deal(&m.deal, &paid);
    m.notify().await;
    let (_, deals) = m.ania.call(Method::GET, "/api/deals?role=seller", None).await;
    assert_eq!(deals[0]["buyer"]["id"], format!("wallet:{stranger}"));
}

#[tokio::test]
async fn wallet_balance_from_chain() {
    let m = market("600000").await;
    m.rpc.set_balance(&m.buyer.to_string(), 1_500_000_000);
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    m.notify().await;
    let (s, w) = m.bartek.call(Method::GET, "/api/me/wallet", None).await;
    assert_eq!(s, StatusCode::OK, "{w}");
    assert_eq!(
        (w["balanceMinor"].clone(), w["currency"].clone(), w["heldMinor"].clone()),
        (json!(1_500_000_000u64), json!("SOL"), json!(60_000_000))
    );
    assert_eq!(w["address"], m.buyer.to_string());
    let celina = m.b.login("celina@demo.pl").await;
    let (_, w) = celina.call(Method::GET, "/api/me/wallet", None).await;
    assert_eq!((w["balanceMinor"].clone(), w["ledger"].clone()), (json!(0), json!([])));
}

#[tokio::test]
async fn chain_sync_endpoint_and_poller() {
    let m = market("200").await;
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Listed, now()));
    let (s, v) = m.ania.call(Method::POST, &format!("/api/chain/sync/{}", m.deal), None).await;
    assert_eq!((s, v["published"].clone()), (StatusCode::OK, json!(true)));
    assert_eq!(m.ania.call(Method::POST, &format!("/api/chain/sync/{}", random_key()), None).await.0, StatusCode::NOT_FOUND);
    assert_eq!(m.ania.call(Method::POST, "/api/chain/sync/nope", None).await.0, StatusCode::BAD_REQUEST);

    // No webhook: the poller (200 ms) picks the purchase up by itself.
    m.rpc.put_deal(&m.deal, &m.chain(ChainStatus::Paid, now()));
    let mut status = Value::Null;
    for _ in 0..30 {
        let (_, d) = m.bartek.call(Method::GET, "/api/deals?role=buyer", None).await;
        status = d[0]["status"].clone();
        if status == "Paid" {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert_eq!(status, "Paid");
    let (_, h) = m.b.anon().call(Method::GET, "/api/health", None).await;
    assert!(h["chain"]["lastSyncAt"].is_i64(), "{h}");
}