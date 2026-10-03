//! Spójność API: kody statusu, kształt błędów, autoryzacja, 403 vs 404, przejścia niedozwolone (409).
mod common;

use common::*;
use reqwest::Method;
use serde_json::json;

#[tokio::test(flavor = "multi_thread")]
async fn auth_and_error_shape() {
    let be = Backend::start(&[]).await;
    let anon = be.anon();
    for (m, p) in [
        (Method::GET, "/api/me"),
        (Method::GET, "/api/me/wallet"),
        (Method::GET, "/api/me/listings"),
        (Method::GET, "/api/deals?role=buyer"),
        (Method::POST, "/api/listings"),
        (Method::POST, "/api/media"),
        (Method::POST, "/api/listings/l-kurtka-levis/purchase"),
        (Method::POST, "/api/deals/x/settle"),
    ] {
        let r = anon.call(m.clone(), p, Some(json!({}))).await;
        expect_error(&r, 401, "UNAUTHORIZED");
    }
    let mut bad = be.anon();
    bad.token = Some("xyz".into());
    expect_error(&bad.get("/api/me").await, 401, "UNAUTHORIZED");
    expect_error(&anon.get("/api/nie-ma").await, 404, "NOT_FOUND");
    expect_error(&anon.call(Method::DELETE, "/api/listings", None).await, 404, "NOT_FOUND");

    let raw = reqwest::Client::new()
        .post(format!("{}/api/auth/login", be.url))
        .header("Content-Type", "application/json")
        .body("{zly json")
        .send()
        .await
        .unwrap();
    let r = (raw.status(), raw.json().await.unwrap());
    expect_error(&r, 400, "VALIDATION");

    let ania = be.login("ania@demo.pl").await;
    expect_error(&ania.post("/api/listings", json!({ "title": "x" })).await, 400, "VALIDATION");
    expect_error(&ania.get("/api/deals?role=admin").await, 400, "VALIDATION");
    expect_error(
        &anon.post("/api/auth/login", json!({ "email": "ania@demo.pl", "password": "zle" })).await,
        401,
        "UNAUTHORIZED",
    );
    for p in ["/api/health", "/api/categories", "/api/listings", "/api/listings/l-kurtka-levis"] {
        assert_eq!(anon.get(p).await.0.as_u16(), 200, "{p}");
    }
    assert_eq!(anon.get("/api/categories").await.1.as_array().unwrap().len(), 6);
    assert_eq!(anon.get("/api/listings").await.1.as_array().unwrap().len(), 3);
}

#[tokio::test(flavor = "multi_thread")]
async fn not_found_vs_forbidden_and_illegal_transitions() {
    let be = Backend::start(&[]).await;
    let (ania, bartek, celina) =
        (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await, be.login("celina@demo.pl").await);
    expect_error(&ania.get("/api/deals/nie-ma").await, 404, "NOT_FOUND");
    expect_error(&ania.post("/api/deals/nie-ma/settle", json!({})).await, 404, "NOT_FOUND");
    expect_error(&bartek.post("/api/listings/nie-ma/purchase", json!({})).await, 404, "NOT_FOUND");

    let (deal, _) = shipped(&ania, &bartek, 100).await;
    let secret = "ab".repeat(32);
    expect_error(&celina.get(&format!("/api/deals/{}", deal.id)).await, 403, "FORBIDDEN");
    for action in ["settle", "accept", "confirm-return"] {
        let r = celina
            .post(&format!("/api/deals/{}/{action}", deal.id), json!({ "qrSecret": secret, "returnQrSecret": secret }))
            .await;
        expect_error(&r, 403, "FORBIDDEN");
    }
    expect_error(
        &celina.call(Method::PATCH, &format!("/api/listings/{}", deal.id), Some(json!({ "priceMinor": 1 }))).await,
        403,
        "FORBIDDEN",
    );

    // Paid: złe akcje i role → 409/403, stan bez zmian
    let l = listing(&ania, 100).await;
    let d = purchase(&bartek, &l).await;
    let id = d.id.clone();
    expect_error(
        &bartek.post(&format!("/api/deals/{id}/accept"), json!({ "qrSecret": secret })).await,
        409,
        "INVALID_STATE",
    );
    expect_error(
        &ania.post(&format!("/api/deals/{id}/confirm-return"), json!({ "returnQrSecret": secret })).await,
        409,
        "INVALID_STATE",
    );
    let ship_body =
        json!({ "qrCommitment": "a".repeat(64), "packingVideoSha256": "a".repeat(64), "trackingNumber": "INP1" });
    expect_error(&bartek.post(&format!("/api/deals/{id}/ship"), ship_body).await, 403, "FORBIDDEN");
    expect_error(&bartek.post(&format!("/api/deals/{id}/settle"), json!({})).await, 409, "DEADLINE_NOT_REACHED");
    expect_error(
        &ania.call(Method::PATCH, &format!("/api/listings/{l}"), Some(json!({ "priceMinor": 1 }))).await,
        409,
        "INVALID_STATE",
    );
    expect_error(&ania.post(&format!("/api/listings/{l}/cancel"), json!({})).await, 409, "INVALID_STATE");
    expect_error(&celina.post(&format!("/api/listings/{l}/purchase"), json!({})).await, 409, "INVALID_STATE");
    expect_error(&ania.post(&format!("/api/listings/{l}/purchase"), json!({})).await, 403, "FORBIDDEN");

    let raw = bartek
        .http
        .post(format!("{}/api/deals/{id}/dispute", be.url))
        .bearer_auth(bartek.token.as_ref().unwrap())
        .header("X-Demo-Scenario", "hack")
        .json(&json!({ "qrSecret": secret, "unboxingVideoSha256": "a".repeat(64),
                       "complaint": { "category": "other", "description": "abc" } }))
        .send()
        .await
        .unwrap();
    expect_error(&(raw.status(), raw.json().await.unwrap()), 400, "VALIDATION");
    let after = bartek.deal(&id).await;
    assert_eq!(format!("{:?}/{:?}", after.status, after.payment.status), "Paid/Secured");
}

#[tokio::test(flavor = "multi_thread")]
async fn register_listing_crud() {
    let be = Backend::start(&[]).await;
    let anon = be.anon();
    let password = hex::encode(rand::random::<[u8; 12]>()); // losowe przy każdym uruchomieniu
    expect_error(
        &anon.post("/api/auth/register", json!({ "email": "ania@demo.pl", "password": password, "name": "A" })).await,
        400,
        "VALIDATION",
    );
    expect_error(
        &anon.post("/api/auth/register", json!({ "email": "zly", "password": password, "name": "A" })).await,
        400,
        "VALIDATION",
    );
    let email = format!("n{}@demo.pl", rand::random::<u32>());
    let r = anon.post("/api/auth/register", json!({ "email": email, "password": password, "name": "Nowy" })).await;
    assert_eq!(r.0.as_u16(), 201, "{}", r.1);
    let mut nowy = be.anon();
    nowy.token = Some(r.1["token"].as_str().unwrap().into());
    assert_eq!(nowy.balance().await, DEMO_START);

    let ania = be.login("ania@demo.pl").await;
    let l = listing(&ania, 1500).await;
    expect_error(&nowy.post(&format!("/api/listings/{l}/cancel"), json!({})).await, 403, "FORBIDDEN");
    let (s, v) = ania.call(Method::PATCH, &format!("/api/listings/{l}"), Some(json!({ "priceMinor": 9900 }))).await;
    assert_eq!((s.as_u16(), v["priceMinor"].as_i64()), (200, Some(9900)));
    let (s, v) = ania.post(&format!("/api/listings/{l}/cancel"), json!({})).await;
    assert_eq!((s.as_u16(), v["status"].as_str()), (200, Some("Cancelled")));
    expect_error(&nowy.post(&format!("/api/listings/{l}/purchase"), json!({})).await, 409, "INVALID_STATE");
    let mine = ania.get("/api/me/listings").await.1;
    assert!(mine.as_array().unwrap().iter().any(|x| x["id"] == l.as_str() && x["status"] == "Cancelled"));
}
