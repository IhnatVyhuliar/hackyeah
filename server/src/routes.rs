//! Trasy HTTP. Kontrakt 1:1 z poprzednim backendem (server/README.md).

use crate::ai::MOCK_SCENARIOS;
use crate::auth::{check_password, sign_token, AuthUser};
use crate::db;
use crate::deals::{self, require_participant, Side};
use crate::disputes;
use crate::error::{ApiError, ApiResult};
use crate::machine::{self, is_hex32, DealAction};
use crate::model::*;
use crate::seed::register_user;
use crate::state::AppState;
use crate::upload;
use crate::wallet;
use axum::body::{Body, Bytes};
use axum::extract::{DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::json;
use anchor_lang::prelude::Pubkey;
use std::collections::HashMap;
use std::str::FromStr;

type Res = ApiResult<Response>;

fn ok<T: serde::Serialize>(v: &T) -> Res {
    Ok(Json(v).into_response())
}
fn created<T: serde::Serialize>(v: &T) -> Res {
    Ok((StatusCode::CREATED, Json(v)).into_response())
}

/// Ciało JSON z błędami w formacie API (400 VALIDATION) zamiast domyślnych odpowiedzi axum.
fn body<T: DeserializeOwned>(b: &Bytes) -> ApiResult<T> {
    serde_json::from_slice(b).map_err(|e| {
        if e.is_syntax() || e.is_eof() {
            ApiError::validation("Niepoprawny JSON")
        } else {
            ApiError::validation(format!("body: {e}"))
        }
    })
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

fn hex32(name: &str, v: &str) -> ApiResult<()> {
    if is_hex32(v) {
        Ok(())
    } else {
        Err(ApiError::validation(format!("{name}: 64 znaki hex lowercase")))
    }
}

fn tracking(name: &str, v: &str) -> ApiResult<String> {
    let t = v.trim();
    if (3..=32).contains(&chars(t)) {
        Ok(t.to_string())
    } else {
        Err(ApiError::validation(format!("{name}: od 3 do 32 znaków")))
    }
}

pub fn router(state: AppState) -> Router {
    let mut api = Router::new()
        .route("/health", get(health))
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/me", get(me))
        .route("/me/wallet", get(my_wallet))
        .route("/me/wallet-address", put(set_wallet_address))
        .route("/me/listings", get(my_listings))
        .route("/categories", get(categories))
        .route("/listings", get(list_listings).post(create_listing))
        .route("/listings/{id}", get(get_listing).patch(update_listing))
        .route("/listings/{id}/cancel", post(cancel_listing))
        .route("/listings/{id}/purchase", post(purchase))
        .route("/deals", get(list_deals))
        .route("/deals/{id}", get(get_deal))
        .route("/deals/{id}/ship", post(ship))
        .route("/deals/{id}/accept", post(accept))
        .route("/deals/{id}/dispute", post(dispute))
        .route("/deals/{id}/return", post(mark_returned))
        .route("/deals/{id}/confirm-return", post(confirm_return))
        .route("/deals/{id}/settle", post(settle))
        .route("/media", post(upload_media).layer(DefaultBodyLimit::disable()));
    // TEST-ONLY: rejestrowany tylko przy NODE_ENV=test albo ENABLE_DEV_CLOCK=1, nigdy w produkcji.
    if state.cfg.dev_clock {
        api = api.route("/dev/clock", post(dev_clock));
    }
    Router::new()
        .nest("/api", api)
        .route("/media/{sha256}", get(get_media))
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        .layer(tower_http::cors::CorsLayer::permissive())
        .with_state(state)
}

async fn not_found() -> ApiError {
    ApiError::not_found("Nie ma takiego endpointu")
}

// ---------- system ----------

async fn health(State(s): State<AppState>) -> Response {
    refresh_ai_status(&s);
    let db_ok = db::db_ok(&s.conn());
    let ai = s.ai_status.lock().unwrap_or_else(|p| p.into_inner()).text.clone();
    let status = if db_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    let mut v = json!({ "ok": db_ok, "db": if db_ok { "ok" } else { "error" }, "ai": ai,
                        "timeouts": s.cfg.timeouts_mode, "version": env!("CARGO_PKG_VERSION"), "payments": "demo" });
    if let Some(sol) = &s.cfg.solana {
        let sync = s.chain_sync.lock().unwrap_or_else(|p| p.into_inner()).clone();
        v["payments"] = json!("solana");
        v["timeouts"] = json!(unbox_escrow::constants::TIMEOUT_PROFILE);
        v["chain"] = json!({ "programId": unbox_escrow::ID.to_string(), "cluster": sol.cluster,
                             "arbiter": sol.arbiter.to_string(), "lastSyncAt": sync.last_sync_at,
                             "lastSyncError": sync.last_error });
    }
    (status, Json(v)).into_response()
}

/// Stan AI odświeżany w tle najwyżej co AI_HEALTH_TTL_MS: health check nigdy nie czeka na AI.
fn refresh_ai_status(s: &AppState) {
    if s.cfg.ai == crate::config::AiMode::Mock {
        return;
    }
    let now_ms = crate::state::unix_now() * 1000;
    {
        let mut st = s.ai_status.lock().unwrap_or_else(|p| p.into_inner());
        if st.checking || (st.checked_at_ms > 0 && now_ms - st.checked_at_ms < s.cfg.ai_health_ttl_ms as i64) {
            return;
        }
        st.checking = true;
    }
    let s = s.clone();
    tokio::spawn(async move {
        let text = s.ai.health().await;
        let mut st = s.ai_status.lock().unwrap_or_else(|p| p.into_inner());
        st.text = text;
        st.checked_at_ms = crate::state::unix_now() * 1000;
        st.checking = false;
    });
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockBody {
    advance_secs: i64,
}

async fn dev_clock(State(s): State<AppState>, b: Bytes) -> Res {
    let i: ClockBody = body(&b)?;
    if !(0..=30 * 86400).contains(&i.advance_secs) {
        return Err(ApiError::validation("advanceSecs: 0..2592000"));
    }
    let now = s.advance_clock(i.advance_secs).ok_or_else(|| ApiError::not_found("Nie ma takiego endpointu"))?;
    ok(&json!({ "testOnly": true, "now": now }))
}

// ---------- konto ----------

#[derive(Deserialize)]
struct RegisterBody {
    email: String,
    password: String,
    name: String,
}

fn valid_email(e: &str) -> bool {
    let Some((local, domain)) = e.split_once('@') else { return false };
    !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && !e.chars().any(char::is_whitespace)
        && !domain.contains('@')
}

async fn register(State(s): State<AppState>, b: Bytes) -> Res {
    let i: RegisterBody = body(&b)?;
    if !valid_email(&i.email) {
        return Err(ApiError::validation("email: niepoprawny adres"));
    }
    if chars(&i.password) < 6 {
        return Err(ApiError::validation("password: co najmniej 6 znaków"));
    }
    let name = i.name.trim();
    if name.is_empty() {
        return Err(ApiError::validation("name: wymagane"));
    }
    if db::user_by_email(&s.conn(), &i.email)?.is_some() {
        return Err(ApiError::validation("Konto z tym adresem już istnieje"));
    }
    let id = format!("u-{}", uuid::Uuid::new_v4());
    let user = register_user(&s, &id, &i.email, name, &i.password).await.map_err(|e| {
        if e.code == "INTERNAL" {
            ApiError::validation("Konto z tym adresem już istnieje")
        } else {
            e
        }
    })?;
    created(&json!({ "token": sign_token(&s, &user.id), "user": user }))
}

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

async fn login(State(s): State<AppState>, b: Bytes) -> Res {
    let i: LoginBody = body(&b)?;
    let row = db::user_by_email(&s.conn(), &i.email)?;
    let Some((user, hash)) = row else { return Err(ApiError::unauthorized("Zły e-mail albo hasło")) };
    if !check_password(i.password, hash).await {
        return Err(ApiError::unauthorized("Zły e-mail albo hasło"));
    }
    ok(&json!({ "token": sign_token(&s, &user.id), "user": user }))
}

#[derive(Deserialize)]
struct WalletAddressBody {
    address: String,
}

/// Links the app's Solana wallet to the account; PAYMENTS=solana maps on-chain parties to users by it.
async fn set_wallet_address(State(s): State<AppState>, AuthUser(mut u): AuthUser, b: Bytes) -> Res {
    let i: WalletAddressBody = body(&b)?;
    let address = i.address.trim().to_string();
    Pubkey::from_str(&address).map_err(|_| ApiError::validation("address: niepoprawny adres portfela Solana"))?;
    let mut conn = s.conn();
    let user = db::tx(&mut conn, |c| {
        if let Some(other) = db::user_by_wallet(c, &address)? {
            if other.id != u.id {
                return Err(ApiError::invalid_state("Ten portfel jest już podłączony do innego konta"));
            }
        }
        u.wallet_address = Some(address);
        db::user_update(c, &u)?;
        Ok(u)
    })?;
    ok(&user)
}

async fn me(AuthUser(u): AuthUser) -> Res {
    ok(&u)
}

async fn my_wallet(State(s): State<AppState>, AuthUser(u): AuthUser) -> Res {
    deals::expire_due_for(&s, &u.id)?; // saldo zawsze po domknięciu transakcji, których termin minął
    ok(&wallet::wallet_of(&s.conn(), &u.id)?)
}

// ---------- ogłoszenia ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListingInput {
    title: Option<String>,
    description: Option<String>,
    category_id: Option<String>,
    condition: Option<Condition>,
    brand: Option<String>,
    size: Option<String>,
    defects: Option<Vec<String>>,
    photos: Option<Vec<Photo>>,
    price_minor: Option<i64>,
}

impl ListingInput {
    /// Walidacja pól obecnych w żądaniu (jak CreateListingInputSchema / .partial()).
    fn validate(&mut self, s: &AppState, user: &str, require_all: bool) -> ApiResult<()> {
        let missing = |f: &str| ApiError::validation(format!("{f}: wymagane"));
        if require_all {
            for (f, present) in [
                ("title", self.title.is_some()),
                ("description", self.description.is_some()),
                ("categoryId", self.category_id.is_some()),
                ("condition", self.condition.is_some()),
                ("brand", self.brand.is_some()),
                ("size", self.size.is_some()),
                ("defects", self.defects.is_some()),
                ("photos", self.photos.is_some()),
                ("priceMinor", self.price_minor.is_some()),
            ] {
                if !present {
                    return Err(missing(f));
                }
            }
        }
        if let Some(t) = &mut self.title {
            *t = t.trim().to_string();
            if !(3..=120).contains(&chars(t)) {
                return Err(ApiError::validation("title: od 3 do 120 znaków"));
            }
        }
        if self.description.as_deref().is_some_and(|d| chars(d) > 4000) {
            return Err(ApiError::validation("description: najwyżej 4000 znaków"));
        }
        if self.brand.as_deref().is_some_and(|d| chars(d) > 60) {
            return Err(ApiError::validation("brand: najwyżej 60 znaków"));
        }
        if self.size.as_deref().is_some_and(|d| chars(d) > 30) {
            return Err(ApiError::validation("size: najwyżej 30 znaków"));
        }
        if let Some(d) = &self.defects {
            if d.len() > 20 || d.iter().any(|x| chars(x) > 300) {
                return Err(ApiError::validation("defects: najwyżej 20 pozycji po 300 znaków"));
            }
        }
        if let Some(p) = self.price_minor {
            if !(1..=100_000_000).contains(&p) {
                return Err(ApiError::validation("priceMinor: od 1 do 100000000"));
            }
        }
        let conn = s.conn();
        if let Some(cat) = &self.category_id {
            if db::doc_get::<Category>(&conn, "category", cat)?.is_none() {
                return Err(ApiError::validation("Nieznana kategoria"));
            }
        }
        if let Some(photos) = &mut self.photos {
            if photos.len() > 10 {
                return Err(ApiError::validation("photos: najwyżej 10"));
            }
            // Zdjęcia muszą być wcześniej wgrane przez tego użytkownika; URL ustala serwer.
            for p in photos.iter_mut() {
                hex32("photos.sha256", &p.sha256)?;
                if !db::media_owned_by(&conn, &p.sha256, user, "image/")? {
                    return Err(ApiError::validation(format!(
                        "Zdjęcie {}… nie zostało wgrane przez Ciebie",
                        &p.sha256[..8]
                    )));
                }
                p.url = s.cfg.media_url(&p.sha256);
            }
        }
        Ok(())
    }
}

fn load_listing(c: &rusqlite::Connection, id: &str) -> ApiResult<Listing> {
    db::doc_get(c, "listing", id)?.ok_or_else(|| ApiError::not_found("Nie ma takiego ogłoszenia"))
}

async fn categories(State(s): State<AppState>) -> Res {
    ok(&db::doc_list::<Category>(&s.conn(), "category")?)
}

async fn list_listings(State(s): State<AppState>, Query(q): Query<HashMap<String, String>>) -> Res {
    let needle = q.get("q").map(|v| v.trim().to_lowercase()).filter(|v| !v.is_empty());
    let cat = q.get("categoryId").filter(|v| !v.is_empty());
    let seller = q.get("sellerId").filter(|v| !v.is_empty());
    let mut list: Vec<Listing> = db::doc_list::<Listing>(&s.conn(), "listing")?
        .into_iter()
        .filter(|l| {
            l.status == ListingStatus::Listed
                && cat.is_none_or(|c| &l.category_id == c)
                && seller.is_none_or(|x| &l.seller_id == x)
                && needle.as_ref().is_none_or(|n| {
                    format!("{} {} {}", l.title, l.description, l.brand).to_lowercase().contains(n.as_str())
                })
        })
        .collect();
    list.sort_by_key(|l| std::cmp::Reverse(l.created_at));
    ok(&list)
}

async fn get_listing(State(s): State<AppState>, Path(id): Path<String>) -> Res {
    ok(&load_listing(&s.conn(), &id)?)
}

async fn my_listings(State(s): State<AppState>, AuthUser(u): AuthUser) -> Res {
    let mut list: Vec<Listing> =
        db::doc_list::<Listing>(&s.conn(), "listing")?.into_iter().filter(|l| l.seller_id == u.id).collect();
    list.sort_by_key(|l| std::cmp::Reverse(l.created_at));
    ok(&list)
}

async fn create_listing(State(s): State<AppState>, AuthUser(u): AuthUser, b: Bytes) -> Res {
    let mut i: ListingInput = body(&b)?;
    i.validate(&s, &u.id, true)?;
    let t = s.now();
    let l = Listing {
        id: format!("l-{}", uuid::Uuid::new_v4()),
        seller_id: u.id.clone(),
        seller: Party { id: u.id.clone(), name: u.name.clone() },
        title: i.title.unwrap_or_default(),
        description: i.description.unwrap_or_default(),
        category_id: i.category_id.unwrap_or_default(),
        condition: i.condition.unwrap_or(Condition::Dobry),
        brand: i.brand.unwrap_or_default(),
        size: i.size.unwrap_or_default(),
        defects: i.defects.unwrap_or_default(),
        photos: i.photos.unwrap_or_default(),
        price_minor: i.price_minor.unwrap_or_default(),
        currency: "PLN".into(),
        status: ListingStatus::Listed,
        created_at: t,
        updated_at: t,
        onchain: None,
    };
    db::doc_put(&s.conn(), "listing", &l.id, &l)?;
    created(&l)
}

/// Edycja tylko przed zakupem (po zakupie treść jest zamrożona w transakcji).
async fn update_listing(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>, b: Bytes) -> Res {
    let mut i: ListingInput = body(&b)?;
    i.validate(&s, &u.id, false)?;
    let t = s.now();
    let mut conn = s.conn();
    let l = db::tx(&mut conn, |c| {
        let mut l = load_listing(c, &id)?;
        if l.seller_id != u.id {
            return Err(ApiError::forbidden("To nie Twoje ogłoszenie"));
        }
        if l.status != ListingStatus::Listed {
            return Err(ApiError::invalid_state("Ogłoszenia nie można już edytować"));
        }
        if let Some(v) = i.title {
            l.title = v;
        }
        if let Some(v) = i.description {
            l.description = v;
        }
        if let Some(v) = i.category_id {
            l.category_id = v;
        }
        if let Some(v) = i.condition {
            l.condition = v;
        }
        if let Some(v) = i.brand {
            l.brand = v;
        }
        if let Some(v) = i.size {
            l.size = v;
        }
        if let Some(v) = i.defects {
            l.defects = v;
        }
        if let Some(v) = i.photos {
            l.photos = v;
        }
        if let Some(v) = i.price_minor {
            l.price_minor = v;
        }
        l.updated_at = t;
        db::doc_put(c, "listing", &l.id, &l)?;
        Ok(l)
    })?;
    ok(&l)
}

async fn cancel_listing(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>) -> Res {
    let t = s.now();
    let mut conn = s.conn();
    let l = db::tx(&mut conn, |c| {
        let mut l = load_listing(c, &id)?;
        if l.seller_id != u.id {
            return Err(ApiError::forbidden("To nie Twoje ogłoszenie"));
        }
        if l.status != ListingStatus::Listed {
            return Err(ApiError::invalid_state("Można anulować tylko niekupione ogłoszenie"));
        }
        l.status = ListingStatus::Cancelled;
        l.updated_at = t;
        db::doc_put(c, "listing", &l.id, &l)?;
        Ok(l)
    })?;
    ok(&l)
}

/// Zakup: zabezpiecza płatność z salda demo i tworzy transakcję (status Paid).
async fn purchase(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>) -> Res {
    created(&deals::purchase(&s, &id, &u)?)
}

// ---------- transakcje ----------

fn participant_deal(s: &AppState, id: &str, user: &str, side: Option<Side>) -> ApiResult<Deal> {
    let d = deals::expire_if_due(s, id)?;
    let r = require_participant(&d, user)?;
    // Najpierw uprawnienia, potem walidacja wskazanych plików (obcy dostaje 403, nie 400).
    match side {
        Some(Side::Buyer) if r != Side::Buyer => Err(ApiError::forbidden("Tę akcję wykonuje kupujący")),
        Some(Side::Seller) if r != Side::Seller => Err(ApiError::forbidden("Tę akcję wykonuje sprzedający")),
        _ => Ok(d),
    }
}

/// Nagranie musi być wgrane wcześniej (POST /api/media) przez tę samą osobę.
fn require_video(s: &AppState, sha: &str, user: &str, what: &str) -> ApiResult<()> {
    if db::media_owned_by(&s.conn(), sha, user, "video/")? {
        Ok(())
    } else {
        Err(ApiError::validation(format!("{what}: najpierw wgraj nagranie (POST /api/media)")))
    }
}

async fn list_deals(State(s): State<AppState>, AuthUser(u): AuthUser, Query(q): Query<HashMap<String, String>>) -> Res {
    let side = match q.get("role").map(String::as_str) {
        Some("buyer") => Side::Buyer,
        Some("seller") => Side::Seller,
        _ => return Err(ApiError::validation("role: buyer albo seller")),
    };
    ok(&deals::deals_of(&s, &u.id, side)?)
}

async fn get_deal(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>) -> Res {
    ok(&participant_deal(&s, &id, &u.id, None)?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShipBody {
    qr_commitment: String,
    packing_video_sha256: String,
    tracking_number: String,
}

async fn ship(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>, b: Bytes) -> Res {
    let i: ShipBody = body(&b)?;
    hex32("qrCommitment", &i.qr_commitment)?;
    hex32("packingVideoSha256", &i.packing_video_sha256)?;
    let tracking_number = tracking("trackingNumber", &i.tracking_number)?;
    participant_deal(&s, &id, &u.id, Some(Side::Seller))?;
    require_video(&s, &i.packing_video_sha256, &u.id, "Nagranie pakowania")?;
    ok(&deals::apply_action(
        &s,
        &id,
        DealAction::Ship {
            actor_id: u.id,
            qr_commitment: i.qr_commitment,
            packing_video_sha256: i.packing_video_sha256,
            tracking_number,
        },
    )?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptBody {
    qr_secret: String,
}

async fn accept(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>, b: Bytes) -> Res {
    let i: AcceptBody = body(&b)?;
    hex32("qrSecret", &i.qr_secret)?;
    participant_deal(&s, &id, &u.id, None)?;
    ok(&deals::apply_action(&s, &id, DealAction::Accept { actor_id: u.id, qr_secret: i.qr_secret })?)
}

#[derive(Deserialize)]
struct ComplaintInput {
    category: ComplaintCategory,
    description: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DisputeBody {
    qr_secret: String,
    unboxing_video_sha256: String,
    complaint: ComplaintInput,
}

async fn dispute(
    State(s): State<AppState>,
    AuthUser(u): AuthUser,
    Path(id): Path<String>,
    headers: HeaderMap,
    b: Bytes,
) -> Res {
    let i: DisputeBody = body(&b)?;
    hex32("qrSecret", &i.qr_secret)?;
    hex32("unboxingVideoSha256", &i.unboxing_video_sha256)?;
    let description = i.complaint.description.trim().to_string();
    if !(3..=2000).contains(&chars(&description)) {
        return Err(ApiError::validation("complaint.description: od 3 do 2000 znaków"));
    }
    let scenario = match headers.get("x-demo-scenario").and_then(|v| v.to_str().ok()) {
        Some(h) if s.cfg.ai == crate::config::AiMode::Mock => {
            if !MOCK_SCENARIOS.contains(&h) {
                return Err(ApiError::validation("X-Demo-Scenario: nieznany scenariusz"));
            }
            Some(h.to_string())
        }
        _ => None,
    };
    participant_deal(&s, &id, &u.id, Some(Side::Buyer))?;
    require_video(&s, &i.unboxing_video_sha256, &u.id, "Nagranie otwarcia")?;
    let complaint = Complaint { v: 1, category: i.complaint.category, description, created_at: s.now() };
    let complaint_hash = machine::hash_document(&complaint);
    let d = deals::apply_action(
        &s,
        &id,
        DealAction::Dispute {
            actor_id: u.id,
            qr_secret: i.qr_secret,
            unboxing_video_sha256: i.unboxing_video_sha256,
            complaint,
            complaint_hash,
        },
    )?;
    disputes::start_analysis(&s, &d.id, scenario);
    ok(&deals::get_deal(&s.conn(), &d.id)?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReturnBody {
    return_qr_commitment: String,
    return_video_sha256: String,
    return_tracking_number: String,
}

async fn mark_returned(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>, b: Bytes) -> Res {
    let i: ReturnBody = body(&b)?;
    hex32("returnQrCommitment", &i.return_qr_commitment)?;
    hex32("returnVideoSha256", &i.return_video_sha256)?;
    let return_tracking_number = tracking("returnTrackingNumber", &i.return_tracking_number)?;
    participant_deal(&s, &id, &u.id, Some(Side::Buyer))?;
    require_video(&s, &i.return_video_sha256, &u.id, "Nagranie pakowania zwrotu")?;
    ok(&deals::apply_action(
        &s,
        &id,
        DealAction::Return {
            actor_id: u.id,
            return_qr_commitment: i.return_qr_commitment,
            return_video_sha256: i.return_video_sha256,
            return_tracking_number,
        },
    )?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmReturnBody {
    return_qr_secret: String,
}

async fn confirm_return(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>, b: Bytes) -> Res {
    let i: ConfirmReturnBody = body(&b)?;
    hex32("returnQrSecret", &i.return_qr_secret)?;
    participant_deal(&s, &id, &u.id, None)?;
    ok(&deals::apply_action(
        &s,
        &id,
        DealAction::ConfirmReturn { actor_id: u.id, return_qr_secret: i.return_qr_secret },
    )?)
}

/// „Odbierz środki” po terminie. Backend domyka też sam (odczyt i cykliczny sweep); to wymusza od razu.
async fn settle(State(s): State<AppState>, AuthUser(u): AuthUser, Path(id): Path<String>) -> Res {
    let d = deals::get_deal(&s.conn(), &id)?;
    require_participant(&d, &u.id)?;
    ok(&deals::apply_action(&s, &id, DealAction::Expire)?)
}

// ---------- media ----------

fn allowed_mime(m: &str) -> bool {
    matches!(m, "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "video/mp4" | "video/quicktime")
}

async fn upload_media(State(s): State<AppState>, AuthUser(u): AuthUser, req: Request) -> Res {
    let saved = upload::receive(&s, req, "file").await?;
    if !allowed_mime(&saved.mime_type) {
        let _ = tokio::fs::remove_file(&saved.tmp_path).await;
        return Err(ApiError::validation(format!("Niedozwolony typ pliku: {}", saved.mime_type)));
    }
    upload::commit(&saved, &s.cfg.media_dir()).await?;
    db::media_insert(&s.conn(), &saved.sha256, &saved.mime_type, saved.size, &u.id)?;
    created(&MediaUpload {
        url: s.cfg.media_url(&saved.sha256),
        sha256: saved.sha256,
        size: saved.size,
        mime_type: saved.mime_type,
    })
}

async fn get_media(State(s): State<AppState>, Path(sha): Path<String>) -> Res {
    if !is_hex32(&sha) {
        return Err(ApiError::validation("Oczekiwano sha256 (hex)"));
    }
    let row = db::media_get(&s.conn(), &sha)?.ok_or_else(|| ApiError::not_found("Nie ma takiego pliku"))?;
    let file = tokio::fs::File::open(s.cfg.media_dir().join(&sha))
        .await
        .map_err(|_| ApiError::not_found("Nie ma takiego pliku"))?;
    let stream = tokio_util::io::ReaderStream::new(file);
    Ok((
        [
            (header::CONTENT_TYPE, row.mime_type),
            (header::CONTENT_LENGTH, row.size.to_string()),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable".to_string()),
        ],
        Body::from_stream(stream),
    )
        .into_response())
}
