mod common;

use common::*;
use reqwest::{Method, StatusCode};
use serde_json::json;

const ADDR_A: &str = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
const ADDR_B: &str = "CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t";

#[tokio::test]
async fn wallet_address_is_validated_unique_and_persisted() {
    let b = Backend::start(&[]).await;
    let ania = b.login("ania@demo.pl").await;
    let bartek = b.login("bartek@demo.pl").await;
    let (s, v) = ania.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": "nope" }))).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::BAD_REQUEST, json!("VALIDATION")));
    let (s, v) = ania.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!((s, v["walletAddress"].clone()), (StatusCode::OK, json!(ADDR_A)));
    let (s, v) = bartek.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!((s, v["error"]["code"].clone()), (StatusCode::CONFLICT, json!("INVALID_STATE")));
    let (s, _) = bartek.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_B }))).await;
    assert_eq!(s, StatusCode::OK);
    let (_, me) = ania.call(Method::GET, "/api/me", None).await;
    assert_eq!(me["walletAddress"], ADDR_A);
    let (s, _) = b.anon().call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_A }))).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn wallet_address_survives_restart_and_is_omitted_when_unset() {
    let mut b = Backend::start(&[]).await;
    let celina = b.login("celina@demo.pl").await;
    let (_, me) = celina.call(Method::GET, "/api/me", None).await;
    assert!(me.get("walletAddress").is_none(), "{me}");
    celina.call(Method::PUT, "/api/me/wallet-address", Some(json!({ "address": ADDR_B }))).await;
    b.restart().await;
    let celina = b.login("celina@demo.pl").await;
    let (_, me) = celina.call(Method::GET, "/api/me", None).await;
    assert_eq!(me["walletAddress"], ADDR_B);
}
