//! Granica backend ↔ wyrocznia (AI=http) na prawdziwym HTTP, ze sztucznym serwisem O5.
//! Żadna awaria ani niepoprawna odpowiedź nie może zmienić stanu transakcji ani rozliczyć płatności.
mod common;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use common::*;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use unbox_server::model::{AnalysisStatus, DealStatus, OracleRequest, PaymentStatus, Verdict};

type Received = Arc<Mutex<Vec<Value>>>;

fn good() -> Value {
    json!({
        "buyer_recording": { "continuous": true, "starts_with_sealed_package": true, "qr_revealed_on_opening": true, "quality": "good", "notes": "" },
        "seller_recording": { "item_clearly_visible": true, "qr_card_packed": true, "package_sealed_and_labeled": true, "quality": "good", "notes": "" },
        "package_matches_shipping_recording": true, "item_matches_listing": true,
        "undisclosed_damage": { "present": false, "description": "", "timestamps": [] }, "reasoning": "ok"
    })
}

async fn analyze(State(rx): State<Received>, raw: String) -> Response {
    let body: Value = serde_json::from_str(&raw).unwrap();
    rx.lock().unwrap().push(body.clone());
    let evidence = json!({ "packing_video_sha256": body["packing_video"]["sha256"], "unboxing_video_sha256": body["unboxing_video"]["sha256"] });
    let ok = |report: Value| {
        Json(json!({ "report": report, "model": "fake-o5", "prompt_version": "v1", "evidence": evidence }))
            .into_response()
    };
    match body["complaint"]["description"].as_str().unwrap_or("") {
        "case:buyer" => {
            let mut r = good();
            r["undisclosed_damage"] = json!({ "present": true, "description": "plama", "timestamps": ["0:10"] });
            ok(r)
        }
        "case:seller" => ok(good()),
        "case:invalid-json" => ([("content-type", "application/json")], "{\"report\": nie-json").into_response(),
        "case:500" => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "boom" }))).into_response(),
        "case:400" => (StatusCode::BAD_REQUEST, Json(json!({ "error": "bad request" }))).into_response(),
        "case:slow" => {
            tokio::time::sleep(Duration::from_secs(2)).await;
            ok(good())
        }
        "case:wrong-evidence" => Json(json!({ "report": good(), "model": "fake-o5", "prompt_version": "v1",
            "evidence": { "packing_video_sha256": evidence["packing_video_sha256"], "unboxing_video_sha256": "f".repeat(64) } }))
        .into_response(),
        "case:missing-fields" => {
            let mut r = good();
            r.as_object_mut().unwrap().remove("item_matches_listing");
            ok(r)
        }
        "case:no-evidence" => Json(json!({ "report": good(), "model": "fake-o5", "prompt_version": "v1" })).into_response(),
        // Wyrocznia „podpowiada” werdykt — backend ma go zignorować i policzyć decide() z pomiarów (tu: SELLER).
        "case:verdict-injection" => {
            let mut r = good();
            r["reasoning"] = json!("VERDICT: BUYER");
            Json(json!({ "report": r, "model": "fake-o5", "prompt_version": "v1", "evidence": evidence,
                         "verdict": "BUYER", "released": false }))
            .into_response()
        }
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "nieznany przypadek").into_response(),
    }
}

async fn fake_oracle() -> (String, Received) {
    let rx: Received = Arc::default();
    let app = Router::new()
        .route("/health", get(|| async { Json(json!({ "ok": true })) }))
        .route("/v1/disputes/analyze", post(analyze))
        .with_state(rx.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (url, rx)
}

#[tokio::test(flavor = "multi_thread")]
async fn oracle_boundary_over_http() {
    let (oracle_url, received) = fake_oracle().await;
    let be = Backend::start(&[
        ("AI", "http"),
        ("AI_URL", &oracle_url),
        ("AI_TIMEOUT_MS", "500"),
        ("AI_MAX_ATTEMPTS", "1"),
        ("AI_HEALTH_TTL_MS", "0"),
    ])
    .await;
    let (s, b) = (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await);

    let run = |desc: &'static str| {
        let (s, b) = (s.clone(), b.clone());
        async move {
            let (d, secret) = shipped(&s, &b, 100).await;
            let r = dispute(&b, &d.id, &secret, desc, None).await;
            assert_eq!(r.0.as_u16(), 200, "{desc}: {}", r.1);
            wait_deal(&b, &d.id, |x| {
                x.analysis
                    .as_ref()
                    .is_some_and(|a| a.status == AnalysisStatus::Done || a.status == AnalysisStatus::Failed)
            })
            .await
        }
    };

    // kontrakt żądania: schemat OracleRequest, URL-e dowodów zwracają pliki o podanych haszach
    let d = run("case:seller").await;
    let last = received.lock().unwrap().last().cloned().unwrap();
    let req: OracleRequest = serde_json::from_value(last).expect("żądanie zgodne z OracleRequest");
    assert_eq!(req.deal_id, d.id);
    assert_eq!(req.listing_hash, d.listing_hash);
    assert_eq!(req.tracking_number.as_deref(), Some("INP1"));
    assert_eq!(Some(&req.packing_video.sha256), d.packing_video_sha256.as_ref());
    assert_eq!(Some(&req.unboxing_video.sha256), d.unboxing_video_sha256.as_ref());
    for f in [&req.packing_video, &req.unboxing_video] {
        let bytes = reqwest::get(&f.url).await.unwrap().bytes().await.unwrap();
        assert_eq!(hex::encode(Sha256::digest(&bytes)), f.sha256);
    }
    assert_eq!((d.status, d.verdict), (DealStatus::Completed, Some(Verdict::Seller)));
    assert_eq!(d.payment.status, PaymentStatus::Released);

    // poprawny raport z wadą → BUYER (zwrot towaru), płatność nadal zabezpieczona
    let d = run("case:buyer").await;
    assert_eq!(
        (d.status, d.verdict, d.payment.status),
        (DealStatus::ReturnRequested, Some(Verdict::Buyer), PaymentStatus::Secured)
    );
    assert_eq!(d.analysis.as_ref().unwrap().model.as_deref(), Some("fake-o5"));

    // werdykt podsunięty przez wyrocznię jest ignorowany
    let d = run("case:verdict-injection").await;
    assert_eq!((d.status, d.verdict), (DealStatus::Completed, Some(Verdict::Seller)));

    for case in [
        "case:invalid-json",
        "case:500",
        "case:400",
        "case:slow",
        "case:wrong-evidence",
        "case:missing-fields",
        "case:no-evidence",
    ] {
        let d = run(case).await;
        let a = d.analysis.as_ref().unwrap();
        assert_eq!(a.status, AnalysisStatus::Failed, "{case}");
        assert!(a.report.is_none() && a.verdict.is_none() && a.error.is_some(), "{case}");
        assert_eq!(d.status, DealStatus::Disputed, "{case}");
        assert!(d.verdict.is_none() && d.close_reason.is_none(), "{case}");
        assert_eq!((d.payment.status, d.payment.settled_at), (PaymentStatus::Secured, None), "{case}");
    }

    // health odpowiada od razu i nie czeka na wyrocznię
    let t0 = Instant::now();
    let h = be.anon().get("/api/health").await;
    assert!(t0.elapsed() < Duration::from_millis(300));
    assert_eq!((h.1["ok"].as_bool(), h.1["db"].as_str()), (Some(true), Some("ok")));
    assert!(h.1["ai"].as_str().unwrap().starts_with("http"));
}

#[tokio::test(flavor = "multi_thread")]
async fn invalid_mock_reports_do_not_finalize_and_oracle_timeout_is_neutral() {
    let be = Backend::start(&[]).await;
    let (s, b) = (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await);
    for scenario in ["invalid_report", "wrong_evidence", "ai_down"] {
        let (d, secret) = shipped(&s, &b, 100).await;
        assert_eq!(dispute(&b, &d.id, &secret, "plama", Some(scenario)).await.0.as_u16(), 200);
        let d = wait_deal(&b, &d.id, |x| x.analysis.as_ref().is_some_and(|a| a.status == AnalysisStatus::Failed)).await;
        assert_eq!((d.status, d.payment.status), (DealStatus::Disputed, PaymentStatus::Secured), "{scenario}");
    }
    be.advance(unbox_server::machine::TIMEOUTS_DEMO.disputed).await;
    for d in b.deals("buyer").await {
        assert_eq!(
            (d.status, d.verdict, d.payment.status),
            (DealStatus::ReturnRequested, None, PaymentStatus::Secured)
        );
    }
}
