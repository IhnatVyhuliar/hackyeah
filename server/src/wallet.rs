//! Demo-płatności: wewnętrzna księga w backendzie. Saldo = suma wpisów użytkownika.
//! Środki kupującego są zabezpieczone od zakupu do rozliczenia transakcji.

use crate::db;
use crate::error::{ApiError, ApiResult};
use crate::machine::PaymentEffect;
use crate::model::*;
use rusqlite::{params, Connection};

fn insert(
    c: &Connection,
    user: &str,
    deal: Option<&str>,
    kind: LedgerType,
    amount: i64,
    label: &str,
    now: Unix,
) -> ApiResult<()> {
    c.execute(
        "INSERT INTO ledger (id, user_id, deal_id, type, amount_minor, label, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![uuid::Uuid::new_v4().to_string(), user, deal, kind.as_str(), amount, label, now],
    )
    .map_err(|e| match e {
        // Unikalny indeks ledger_settlement: druga wypłata/zwrot tej samej transakcji.
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            ApiError::invalid_state("Płatność jest już rozliczona")
        }
        other => other.into(),
    })?;
    Ok(())
}

pub fn balance_of(c: &Connection, user: &str) -> ApiResult<i64> {
    Ok(c.query_row("SELECT COALESCE(SUM(amount_minor), 0) FROM ledger WHERE user_id = ?1", params![user], |r| {
        r.get(0)
    })?)
}

pub fn top_up(c: &Connection, user: &str, amount: i64, now: Unix) -> ApiResult<()> {
    insert(c, user, None, LedgerType::Topup, amount, "Środki startowe (demo)", now)
}

/// Zakup: pobiera cenę z salda kupującego i zabezpiecza ją do rozliczenia (w tej samej transakcji SQLite).
pub fn secure(c: &Connection, deal: &Deal, now: Unix) -> ApiResult<()> {
    let amount = deal.payment.amount_minor;
    if balance_of(c, &deal.buyer_id)? < amount {
        return Err(ApiError::insufficient_funds());
    }
    insert(
        c,
        &deal.buyer_id,
        Some(&deal.id),
        LedgerType::Secure,
        -amount,
        &format!("Zabezpieczono płatność: {}", deal.listing.title),
        now,
    )
}

/// Rozliczenie (raz na transakcję; unikalny indeks w bazie blokuje drugie).
pub fn settle(c: &Connection, deal: &Deal, effect: PaymentEffect, now: Unix) -> ApiResult<()> {
    let amount = deal.payment.amount_minor;
    match effect {
        PaymentEffect::Release => insert(
            c,
            &deal.seller_id,
            Some(&deal.id),
            LedgerType::Release,
            amount,
            &format!("Wypłata za: {}", deal.listing.title),
            now,
        ),
        PaymentEffect::Refund => insert(
            c,
            &deal.buyer_id,
            Some(&deal.id),
            LedgerType::Refund,
            amount,
            &format!("Zwrot za: {}", deal.listing.title),
            now,
        ),
    }
}

pub fn wallet_of(c: &Connection, user: &str) -> ApiResult<Wallet> {
    let mut st = c.prepare(
        "SELECT id, deal_id, type, amount_minor, label, at FROM ledger WHERE user_id = ?1 ORDER BY at DESC, rowid DESC",
    )?;
    let ledger = st
        .query_map(params![user], |r| {
            Ok(LedgerEntry {
                id: r.get(0)?,
                deal_id: r.get(1)?,
                kind: LedgerType::parse(&r.get::<_, String>(2)?).unwrap_or(LedgerType::Topup),
                amount_minor: r.get(3)?,
                label: r.get(4)?,
                at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let held_minor = db::doc_list::<Deal>(c, "deal")?
        .iter()
        .filter(|d| d.buyer_id == user && d.payment.status == PaymentStatus::Secured)
        .map(|d| d.payment.amount_minor)
        .sum();
    Ok(Wallet { balance_minor: balance_of(c, user)?, currency: "PLN".into(), held_minor, ledger })
}
