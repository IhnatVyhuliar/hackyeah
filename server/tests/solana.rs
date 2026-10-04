mod common;

use anchor_lang::prelude::Pubkey;
use common::fake_rpc::chain_deal;
use common::fake_rpc::FakeRpc;
use common::*;
use reqwest::{Method, StatusCode};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::str::FromStr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus, Verdict as ChainVerdict};

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
    let (s, e) =
        ania.call(Method::PATCH, "/api/listings/l-kurtka-levis", Some(json!({ "title": "Inna kurtka" }))).await;
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
    assert_eq!(
        (d["payment"]["amountMinor"].clone(), d["payment"]["currency"].clone()),
        (json!(60_000_000), json!("SOL"))
    );
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
    assert_eq!(
        m.ania.call(Method::POST, &format!("/api/chain/sync/{}", random_key()), None).await.0,
        StatusCode::NOT_FOUND
    );
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

#[tokio::test]
async fn dispute_complaint_and_oracle_report_are_mirrored_from_media() {
    let m = market("600000").await;
    let t = now();
    let complaint =
        r#"{"v":1,"category":"damaged","description":"Plama na rękawie","created_at":1791050000}"#.as_bytes().to_vec();
    let (_, c) = m.bartek.upload_bytes(complaint, "application/json", "complaint.json").await;
    let report = serde_json::to_vec(&json!({
        "v": 1, "deal": m.deal.to_string(), "verdict": "BUYER", "decided_by": "decide", "model": "gemini-x", "prompt_version": "v2",
        "buyer_recording": { "continuous": true, "starts_with_sealed_package": true, "qr_revealed_on_opening": true, "quality": "good", "notes": "" },
        "seller_recording": { "item_clearly_visible": true, "qr_card_packed": true, "package_sealed_and_labeled": true, "quality": "good", "notes": "" },
        "package_matches_shipping_recording": true, "item_matches_listing": true,
        "undisclosed_damage": { "present": true, "description": "plama", "timestamps": ["00:41"] }, "reasoning": "Plama poza listą wad."
    })).unwrap();
    let (_, r) = m.ania.upload_bytes(report, "application/json", "report.json").await; // any account may upload
    let to32 = |v: &Value| -> [u8; 32] { hex::decode(v["sha256"].as_str().unwrap()).unwrap().try_into().unwrap() };

    let mut disputed = m.chain(ChainStatus::Disputed, t);
    disputed.complaint_hash = to32(&c);
    disputed.unboxing_video_hash = [7; 32];
    m.rpc.put_deal(&m.deal, &disputed);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!(d["complaint"]["description"], "Plama na rękawie");
    assert!(d["analysis"].is_null());

    let mut resolved = disputed.clone();
    resolved.status = ChainStatus::ReturnRequested;
    resolved.status_changed_at = t + 5;
    resolved.verdict = ChainVerdict::Buyer;
    resolved.report_hash = to32(&r);
    m.rpc.put_deal(&m.deal, &resolved);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    let a = &d["analysis"];
    assert_eq!(
        (a["status"].clone(), a["verdict"].clone(), a["model"].clone()),
        (json!("done"), json!("BUYER"), json!("gemini-x"))
    );
    assert_eq!(a["reportHash"], r["sha256"]);
    assert_eq!(a["report"]["reasoning"], "Plama poza listą wad.");
}

#[tokio::test]
async fn verdict_without_a_readable_report_still_shows_the_verdict() {
    let m = market("600000").await;
    let mut resolved = m.chain(ChainStatus::Completed, now());
    resolved.verdict = ChainVerdict::Seller;
    resolved.report_hash = [9; 32]; // file never uploaded (or decided by evidence elsewhere)
    m.rpc.put_deal(&m.deal, &resolved);
    m.notify().await;
    let (_, d) = m.ania.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert_eq!((d["analysis"]["verdict"].clone(), d["analysis"]["report"].clone()), (json!("SELLER"), Value::Null));
    assert_eq!(d["analysis"]["reportHash"], hex::encode([9u8; 32]));
}

fn put_media(m: &Market, bytes: &[u8], name_hash: &[u8; 32]) {
    let dir = m.b.dir.path().join("media");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join(hex::encode(name_hash)), bytes).unwrap();
}

#[tokio::test]
async fn complaint_file_not_matching_its_hash_is_ignored() {
    let m = market("600000").await;
    let mut disputed = m.chain(ChainStatus::Disputed, now());
    disputed.complaint_hash = [5; 32];
    // Valid complaint JSON, but its sha256 is not the committed [5; 32].
    put_media(
        &m,
        br#"{"v":1,"category":"damaged","description":"podrobione","created_at":1}"#,
        &disputed.complaint_hash,
    );
    m.rpc.put_deal(&m.deal, &disputed);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert!(d["complaint"].is_null(), "{d}");
}

#[tokio::test]
async fn oversized_committed_file_is_not_read() {
    use sha2::{Digest, Sha256};
    let m = market("600000").await;
    // A hash-valid complaint over the 1 MiB cap (e.g. a video hash committed as complaint_hash).
    let big = format!(r#"{{"v":1,"category":"damaged","description":"{}","created_at":1}}"#, "x".repeat(2 << 20));
    let h: [u8; 32] = Sha256::digest(big.as_bytes()).into();
    put_media(&m, big.as_bytes(), &h);
    let mut disputed = m.chain(ChainStatus::Disputed, now());
    disputed.complaint_hash = h;
    m.rpc.put_deal(&m.deal, &disputed);
    m.notify().await;
    let (_, d) = m.bartek.call(Method::GET, "/api/deals/l-kurtka-levis", None).await;
    assert!(d["complaint"].is_null(), "{d}");
}
