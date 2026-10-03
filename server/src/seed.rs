//! Dane startowe (deterministyczne id). Seed działa tylko na pustej bazie (albo po resecie),
//! więc restart serwera niczego nie zmienia.

use crate::auth::hash_password;
use crate::db;
use crate::error::ApiResult;
use crate::model::*;
use crate::state::AppState;
use crate::wallet;

/// Udokumentowane hasło kont demo.
pub const DEMO_PASSWORD: &str = "demo1234";
pub const DEMO_START_BALANCE_MINOR: i64 = 100_000;

pub async fn register_user(state: &AppState, id: &str, email: &str, name: &str, password: &str) -> ApiResult<User> {
    let user = User { id: id.into(), email: email.to_lowercase(), name: name.into(), created_at: state.now() };
    let hash = hash_password(password.to_string()).await?;
    let now = state.now();
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        db::user_insert(c, &user, &hash)?;
        wallet::top_up(c, &user.id, DEMO_START_BALANCE_MINOR, now)
    })?;
    Ok(user)
}

fn categories() -> Vec<Category> {
    [
        ("odziez-damska", "Odzież damska", "👗"),
        ("odziez-meska", "Odzież męska", "👔"),
        ("buty", "Buty", "👟"),
        ("dodatki", "Torebki i dodatki", "👜"),
        ("dzieci", "Dla dzieci", "🧸"),
        ("inne", "Inne", "📦"),
    ]
    .into_iter()
    .map(|(slug, name, icon)| Category { id: slug.into(), slug: slug.into(), name: name.into(), icon: icon.into() })
    .collect()
}

fn listings(t: Unix) -> Vec<Listing> {
    let seller = Party { id: "u-ania".into(), name: "Ania Kowalska".into() };
    let mk = |id: &str,
              title: &str,
              desc: &str,
              cat: &str,
              cond: Condition,
              brand: &str,
              size: &str,
              defects: &[&str],
              price: i64| Listing {
        id: id.into(),
        seller_id: seller.id.clone(),
        seller: seller.clone(),
        title: title.into(),
        description: desc.into(),
        category_id: cat.into(),
        condition: cond,
        brand: brand.into(),
        size: size.into(),
        defects: defects.iter().map(|s| s.to_string()).collect(),
        photos: vec![],
        price_minor: price,
        currency: "PLN".into(),
        status: ListingStatus::Listed,
        created_at: t,
        updated_at: t,
    };
    vec![
        mk(
            "l-kurtka-levis",
            "Kurtka jeansowa Levi's",
            "Klasyczna kurtka, noszona kilka razy.",
            "odziez-meska",
            Condition::Dobry,
            "Levi's",
            "M",
            &["Lekkie przetarcie na lewym mankiecie"],
            12_000,
        ),
        mk(
            "l-sukienka-zara",
            "Sukienka letnia Zara",
            "Lekka, w kwiaty.",
            "odziez-damska",
            Condition::JakNowy,
            "Zara",
            "S",
            &[],
            6_000,
        ),
        mk(
            "l-sneakersy-nike",
            "Sneakersy Nike Air Max",
            "Rozmiar 42, oryginalne pudełko.",
            "buty",
            Condition::WidoczneSlady,
            "Nike",
            "42",
            &["Zabrudzona podeszwa"],
            18_000,
        ),
    ]
}

pub async fn seed(state: &AppState, reset: bool) -> ApiResult<()> {
    if reset {
        db::reset(&state.conn())?;
    }
    if db::user_by_id(&state.conn(), "u-ania")?.is_some() {
        return Ok(());
    }
    for (id, email, name) in [
        ("u-ania", "ania@demo.pl", "Ania Kowalska"),
        ("u-bartek", "bartek@demo.pl", "Bartek Nowak"),
        ("u-celina", "celina@demo.pl", "Celina Wiśniewska"),
    ] {
        register_user(state, id, email, name, DEMO_PASSWORD).await?;
    }
    let now = state.now();
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        for cat in categories() {
            db::doc_put(c, "category", &cat.id, &cat)?;
        }
        for l in listings(now) {
            db::doc_put(c, "listing", &l.id, &l)?;
        }
        Ok(())
    })?;
    tracing::info!("seed: 3 użytkowników, 6 kategorii, 3 ogłoszenia");
    Ok(())
}
