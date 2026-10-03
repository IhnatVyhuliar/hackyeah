//! Upload mediów (bez zaufania do klienta) i trwałość danych (restart, idempotentny seed, tryb produkcyjny).
mod common;

use common::*;
use serde_json::json;
use sha2::{Digest, Sha256};

async fn raw_post(be: &Backend, token: &str, content_type: &str, body: Vec<u8>) -> Resp {
    let res = reqwest::Client::new()
        .post(format!("{}/api/media", be.url))
        .bearer_auth(token)
        .header("Content-Type", content_type)
        .body(body)
        .send()
        .await
        .unwrap();
    (res.status(), res.json().await.unwrap_or(serde_json::Value::Null))
}

#[tokio::test(flavor = "multi_thread")]
async fn media_upload_rules() {
    let be = Backend::start(&[("MAX_UPLOAD_MB", "0.05")]).await; // ok. 52 KB
    let ania = be.login("ania@demo.pl").await;
    let token = ania.token.clone().unwrap();

    // hasz liczy serwer, nazwa od klienta ignorowana, plik wraca bajt w bajt, brak nadpisania
    let data = random_bytes(4096);
    let (s, v) = ania.upload_bytes(data.clone(), "video/mp4", "../../etc/passwd.mp4").await;
    assert_eq!(s.as_u16(), 201, "{v}");
    let sha = hex::encode(Sha256::digest(&data));
    assert_eq!(v["sha256"], sha.as_str());
    assert_eq!(v["url"], format!("{}/media/{sha}", be.url).as_str());
    assert_eq!((v["size"].as_u64(), v["mimeType"].as_str()), (Some(4096), Some("video/mp4")));
    let got = reqwest::get(format!("{}/media/{sha}", be.url)).await.unwrap();
    assert_eq!(got.headers()["content-type"], "video/mp4");
    assert_eq!(got.bytes().await.unwrap().to_vec(), data);
    let (s, v) = ania.upload_bytes(data.clone(), "video/mp4", "inna-nazwa.mp4").await;
    assert_eq!((s.as_u16(), v["sha256"].as_str()), (201, Some(sha.as_str())));

    // błędy wejścia
    let form_field_only = b"--b\r\nContent-Disposition: form-data; name=\"markers\"\r\n\r\n{}\r\n--b--\r\n".to_vec();
    expect_error(&raw_post(&be, &token, "multipart/form-data; boundary=b", form_field_only).await, 400, "VALIDATION");
    expect_error(&raw_post(&be, &token, "application/json", b"{\"a\":1}".to_vec()).await, 400, "VALIDATION");
    expect_error(&raw_post(&be, &token, "multipart/form-data", b"xxx".to_vec()).await, 400, "VALIDATION");
    let broken = b"--b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a\"\r\n\r\nabc".to_vec();
    expect_error(&raw_post(&be, &token, "multipart/form-data; boundary=b", broken).await, 400, "VALIDATION");
    expect_error(&ania.upload_bytes(vec![], "video/mp4", "a.mp4").await, 400, "VALIDATION");
    expect_error(&ania.upload_bytes(random_bytes(100), "text/html", "a.html").await, 400, "VALIDATION");
    expect_error(&ania.upload_bytes(random_bytes(200_000), "video/mp4", "a.mp4").await, 413, "VALIDATION");

    // ten sam plik wgrany przez dwie osoby może użyć każda z nich (i tylko one)
    let celina = be.login("celina@demo.pl").await;
    let bartek = be.login("bartek@demo.pl").await;
    let photo = random_bytes(2048);
    let (_, a) = ania.upload_bytes(photo.clone(), "image/jpeg", "p.jpg").await;
    let (_, c) = celina.upload_bytes(photo, "image/jpeg", "p.jpg").await;
    assert_eq!(a["sha256"], c["sha256"]);
    let input = json!({ "title": "Wspólne zdjęcie", "description": "", "categoryId": "inne", "condition": "dobry",
                        "brand": "", "size": "", "defects": [], "photos": [{ "url": a["url"], "sha256": a["sha256"] }], "priceMinor": 100 });
    assert_eq!(celina.post("/api/listings", input.clone()).await.0.as_u16(), 201);
    expect_error(&bartek.post("/api/listings", input).await, 400, "VALIDATION");

    // GET /media: zły identyfikator 400, nieistniejący 404
    assert_eq!(reqwest::get(format!("{}/media/abc", be.url)).await.unwrap().status().as_u16(), 400);
    assert_eq!(reqwest::get(format!("{}/media/{}", be.url, "0".repeat(64))).await.unwrap().status().as_u16(), 404);
}

#[tokio::test(flavor = "multi_thread")]
async fn restart_keeps_data_and_seed_is_idempotent() {
    let mut be = Backend::start(&[]).await;
    let (s, b) = (be.login("ania@demo.pl").await, be.login("bartek@demo.pl").await);
    let l = listing(&s, 250).await;
    let deal = purchase(&b, &l).await;
    let before_wallet = b.wallet().await;
    let before_listings = b.get("/api/listings").await.1;
    be.restart().await;
    be.restart().await;
    // ten sam token działa po restarcie (sekret JWT trwały w DATA_DIR)
    assert_eq!(format!("{:?}", b.deal(&deal.id).await.status), "Paid");
    let w = b.wallet().await;
    assert_eq!(w["balanceMinor"], before_wallet["balanceMinor"], "brak ponownego doładowania kont demo");
    assert_eq!(w["ledger"].as_array().unwrap().len(), before_wallet["ledger"].as_array().unwrap().len());
    assert_eq!(b.get("/api/listings").await.1, before_listings);
    assert_eq!(b.get("/api/categories").await.1.as_array().unwrap().len(), 6);
    assert!(be.dir.path().join("unbox.db").exists());
}

#[tokio::test(flavor = "multi_thread")]
async fn production_guards() {
    let secret = hex::encode(rand::random::<[u8; 32]>());
    let prod = Backend::start(&[("NODE_ENV", "production"), ("ENABLE_DEV_CLOCK", "1"), ("JWT_SECRET", &secret)]).await;
    let r = reqwest::Client::new()
        .post(format!("{}/api/dev/clock", prod.url))
        .json(&json!({ "advanceSecs": 1 }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status().as_u16(), 404, "zegar testowy niedostępny w produkcji");
    drop(prod);
    let err = Backend::try_start(&[("NODE_ENV", "production"), ("JWT_SECRET", "")])
        .await
        .err()
        .expect("start bez JWT_SECRET");
    assert!(err.contains("JWT_SECRET"), "{err}");
}
