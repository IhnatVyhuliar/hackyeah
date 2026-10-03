//! Mirrors `Deal` accounts of the program into SQLite. Triggered by the Helius webhook, the poller and
//! `POST /api/chain/sync/{address}`. Read-only: the chain is the source of truth, SQLite is a cache.

use super::explorer_tx_url;
use super::mirror::{mirror_deal, model_status, ChainSnapshot};
use crate::db;
use crate::error::{ApiError, ApiResult};
use crate::model::*;
use crate::state::AppState;
use anchor_lang::prelude::Pubkey;
use anchor_lang::AccountDeserialize;
use std::collections::HashMap;
use std::time::Duration;
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus};

/// Deal PDA (base58) → listing id, for every listing published (or being published) to the program.
pub fn known_addresses(state: &AppState) -> ApiResult<HashMap<String, String>> {
    Ok(db::doc_list::<Listing>(&state.conn(), "listing")?
        .into_iter()
        .filter_map(|l| l.onchain.map(|o| (o.deal, l.id)))
        .collect())
}

/// Re-reads `addresses` over RPC; returns how many Deal accounts of known listings were applied.
pub async fn sync_addresses(state: &AppState, addresses: &[Pubkey]) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let accounts = chain.accounts(addresses).await?;
    ingest(state, accounts).await
}

/// Full pass over getProgramAccounts: startup (state survives in SQLite anyway) and the polling fallback.
pub async fn sync_all(state: &AppState) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let result = match chain.all_deals().await {
        Ok(accounts) => ingest(state, accounts).await,
        Err(e) => Err(e),
    };
    let mut sync = state.chain_sync.lock().unwrap_or_else(|p| p.into_inner());
    match &result {
        Ok(_) => {
            sync.last_sync_at = Some(state.now());
            sync.last_error = None;
        }
        Err(e) => sync.last_error = Some(e.clone()),
    }
    result
}

/// Fallback when webhooks do not arrive (no tunnel, Helius hiccup). The first tick runs at once.
pub fn spawn_poller(state: &AppState) {
    let Some(cfg) = state.cfg.solana.clone() else { return };
    let s = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(cfg.poll_ms.max(100)));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            if let Err(e) = sync_all(&s).await {
                tracing::warn!("chain poll: {e}");
            }
        }
    });
}

async fn ingest(state: &AppState, accounts: Vec<(Pubkey, Vec<u8>)>) -> Result<usize, String> {
    let chain = state.chain.clone().ok_or("PAYMENTS=demo")?;
    let known = known_addresses(state).map_err(|e| e.message)?;
    let mut applied = 0;
    for (address, data) in accounts {
        let key = address.to_string();
        let Some(listing_id) = known.get(&key) else {
            tracing::debug!(%key, "deal of an unknown listing, skipped");
            continue;
        };
        let deal = match ChainDeal::try_deserialize(&mut data.as_slice()) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!(%key, "not a current Deal account, skipped: {e}");
                continue;
            }
        };
        let signature = if status_changes(state, listing_id, deal.status) {
            chain.latest_signature(&address).await.unwrap_or_else(|e| {
                tracing::warn!(%key, "no signature: {e}");
                None
            })
        } else {
            None
        };
        apply(state, listing_id, &key, &deal, signature).map_err(|e| e.message)?;
        applied += 1;
    }
    Ok(applied)
}

fn status_changes(state: &AppState, listing_id: &str, status: ChainStatus) -> bool {
    let Some(next) = model_status(status) else { return false };
    let stored: Option<Deal> = db::doc_get(&state.conn(), "deal", listing_id).ok().flatten();
    stored.map(|d| d.status) != Some(next)
}

fn apply(state: &AppState, listing_id: &str, address: &str, chain: &ChainDeal, signature: Option<String>) -> ApiResult<()> {
    let explorer_url = signature.as_deref().zip(state.cfg.solana.as_ref()).map(|(sig, cfg)| explorer_tx_url(sig, cfg));
    let now = state.now();
    let mut conn = state.conn();
    db::tx(&mut conn, |c| {
        let mut l: Listing =
            db::doc_get(c, "listing", listing_id)?.ok_or_else(|| ApiError::not_found("Nie ma takiego ogłoszenia"))?;
        let Some(onchain) = l.onchain.as_mut() else { return Ok(()) };
        // The account must describe exactly the content we serve; otherwise it is not this listing's deal.
        if hex::encode(chain.listing_hash) != onchain.listing_hash || chain.seller.to_string() != onchain.seller_wallet {
            tracing::warn!(%address, "on-chain deal does not match the stored listing, ignored");
            return Ok(());
        }
        match chain.status {
            ChainStatus::Listed => {
                if !onchain.published {
                    onchain.published = true;
                    l.updated_at = now;
                    db::doc_put(c, "listing", &l.id, &l)?;
                }
            }
            ChainStatus::Cancelled => {
                if l.status != ListingStatus::Cancelled {
                    l.status = ListingStatus::Cancelled;
                    l.updated_at = now;
                    db::doc_put(c, "listing", &l.id, &l)?;
                }
            }
            _ => {
                onchain.published = true;
                if l.status != ListingStatus::Sold {
                    l.status = ListingStatus::Sold;
                    l.updated_at = now;
                }
                db::doc_put(c, "listing", &l.id, &l)?;
                let prev: Option<Deal> = db::doc_get(c, "deal", &l.id)?;
                let buyer_wallet = chain.buyer.to_string();
                let buyer = match db::user_by_wallet(c, &buyer_wallet)? {
                    Some(u) => Party { id: u.id, name: u.name },
                    None => Party { id: format!("wallet:{buyer_wallet}"), name: format!("Portfel {}…", &buyer_wallet[..6]) },
                };
                let snap = ChainSnapshot { address, deal: chain, signature, explorer_url };
                if let Some(next) = mirror_deal(prev.as_ref(), &l, &snap, buyer, now) {
                    db::doc_put(c, "deal", &next.id, &next)?;
                }
            }
        }
        Ok(())
    })
}
