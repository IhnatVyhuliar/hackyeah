//! Transakcje: każda zmiana stanu przechodzi przez `machine::transition`, a rozliczenie płatności
//! dzieje się w tej samej transakcji SQLite co zapis stanu.

use crate::db;
use crate::error::{ApiError, ApiResult};
use crate::machine::{self, DealAction};
use crate::model::*;
use crate::state::AppState;
use crate::wallet;
use rusqlite::Connection;

pub fn get_deal(c: &Connection, id: &str) -> ApiResult<Deal> {
    db::doc_get::<Deal>(c, "deal", id)?.ok_or_else(|| ApiError::not_found("Nie ma takiej transakcji"))
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Buyer,
    Seller,
}

pub fn require_participant(d: &Deal, user: &str) -> ApiResult<Side> {
    if d.buyer_id == user {
        Ok(Side::Buyer)
    } else if d.seller_id == user {
        Ok(Side::Seller)
    } else {
        Err(ApiError::forbidden("Nie jesteś stroną tej transakcji"))
    }
}

/// Wykonuje akcję atomowo: stan + oś czasu + księga płatności.
pub fn apply_action(state: &AppState, id: &str, action: DealAction) -> ApiResult<Deal> {
    let now = state.now();
    let timeouts = state.cfg.timeouts;
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        let d = get_deal(c, id)?;
        let r = machine::transition(&d, action, now, &timeouts)?;
        let mut next = r.deal;
        next.timeline = d.timeline.clone();
        next.timeline.push(r.event);
        if let Some(effect) = r.effect {
            wallet::settle(c, &next, effect, now)?;
        }
        db::doc_put(c, "deal", &next.id, &next)?;
        Ok(next)
    })
}

/// Leniwe domknięcie po terminie (settle_expired). Zwraca aktualny stan.
pub fn expire_if_due(state: &AppState, id: &str) -> ApiResult<Deal> {
    let d = get_deal(&state.conn(), id)?;
    match d.deadline_at {
        Some(dl) if state.now() >= dl => match apply_action(state, id, DealAction::Expire) {
            Ok(d) => Ok(d),
            Err(e) => {
                tracing::warn!("expire {id}: {}", e.message);
                get_deal(&state.conn(), id)
            }
        },
        _ => Ok(d),
    }
}

pub fn purchase(state: &AppState, listing_id: &str, buyer: &User) -> ApiResult<Deal> {
    let t = state.now();
    let timeouts = state.cfg.timeouts;
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        let mut l: Listing =
            db::doc_get(c, "listing", listing_id)?.ok_or_else(|| ApiError::not_found("Nie ma takiego ogłoszenia"))?;
        if l.seller_id == buyer.id {
            return Err(ApiError::forbidden("Nie możesz kupić własnego ogłoszenia"));
        }
        if l.status != ListingStatus::Listed {
            return Err(ApiError::invalid_state("Ogłoszenie nie jest już dostępne"));
        }
        let metadata = ListingMetadata::of(&l);
        let deal = Deal {
            id: l.id.clone(),
            listing_hash: machine::hash_document(&metadata),
            listing: metadata,
            seller_id: l.seller_id.clone(),
            seller: l.seller.clone(),
            buyer_id: buyer.id.clone(),
            buyer: Party { id: buyer.id.clone(), name: buyer.name.clone() },
            status: DealStatus::Paid,
            status_changed_at: t,
            deadline_at: Some(t + timeouts.paid),
            payment: Payment {
                status: PaymentStatus::Secured,
                amount_minor: l.price_minor,
                currency: l.currency.clone(),
                secured_at: t,
                settled_at: None,
            },
            qr_commitment: None,
            packing_video_sha256: None,
            tracking_number: None,
            unboxing_video_sha256: None,
            complaint: None,
            complaint_hash: None,
            analysis: None,
            verdict: None,
            return_qr_commitment: None,
            return_video_sha256: None,
            return_tracking_number: None,
            close_reason: None,
            timeline: vec![TimelineEvent {
                at: t,
                kind: "paid".into(),
                label: "Kupujący zapłacił: środki zabezpieczone do zakończenia transakcji".into(),
            }],
            created_at: t,
        };
        wallet::secure(c, &deal, t)?;
        l.status = ListingStatus::Sold;
        l.updated_at = t;
        db::doc_put(c, "listing", &l.id, &l)?;
        db::doc_put(c, "deal", &deal.id, &deal)?;
        Ok(deal)
    })
}

fn due_ids(state: &AppState, filter: impl Fn(&Deal) -> bool) -> ApiResult<Vec<String>> {
    let now = state.now();
    Ok(db::doc_list::<Deal>(&state.conn(), "deal")?
        .into_iter()
        .filter(|d| filter(d) && d.deadline_at.is_some_and(|dl| now >= dl))
        .map(|d| d.id)
        .collect())
}

pub fn deals_of(state: &AppState, user: &str, side: Side) -> ApiResult<Vec<Deal>> {
    for id in due_ids(state, |d| (if side == Side::Buyer { &d.buyer_id } else { &d.seller_id }) == user)? {
        expire_if_due(state, &id)?;
    }
    let mut out: Vec<Deal> = db::doc_list::<Deal>(&state.conn(), "deal")?
        .into_iter()
        .filter(|d| (if side == Side::Buyer { &d.buyer_id } else { &d.seller_id }) == user)
        .collect();
    out.sort_by_key(|d| std::cmp::Reverse(d.created_at));
    Ok(out)
}

/// Domyka przeterminowane transakcje użytkownika (np. przed policzeniem salda w portfelu).
pub fn expire_due_for(state: &AppState, user: &str) -> ApiResult<()> {
    for id in due_ids(state, |d| d.buyer_id == user || d.seller_id == user)? {
        expire_if_due(state, &id)?;
    }
    Ok(())
}

/// Domyka wszystkie transakcje po terminie (wywoływane cyklicznie).
pub fn sweep_expired(state: &AppState) -> ApiResult<usize> {
    let ids = due_ids(state, |_| true)?;
    for id in &ids {
        expire_if_due(state, id)?;
    }
    Ok(ids.len())
}
