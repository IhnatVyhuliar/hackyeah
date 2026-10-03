mod common;

use common::fake_rpc::FakeRpc;
use common::*;
use reqwest::{Method, StatusCode};

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
