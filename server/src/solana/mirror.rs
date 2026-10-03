//! Pure mapping of an on-chain `Deal` account onto the API `Deal` document (PAYMENTS=solana).
//! The program decides status and money; this only translates them and keeps the timeline.

use crate::machine::status_label;
use crate::model::*;
use unbox_escrow::state::{Deal as ChainDeal, DealStatus as ChainStatus, Verdict as ChainVerdict};

pub struct ChainSnapshot<'a> {
    pub address: &'a str,
    pub deal: &'a ChainDeal,
    pub signature: Option<String>,
    pub explorer_url: Option<String>,
}

pub fn model_status(s: ChainStatus) -> Option<DealStatus> {
    Some(match s {
        ChainStatus::Paid => DealStatus::Paid,
        ChainStatus::Shipped => DealStatus::Shipped,
        ChainStatus::Disputed => DealStatus::Disputed,
        ChainStatus::ReturnRequested => DealStatus::ReturnRequested,
        ChainStatus::Returning => DealStatus::Returning,
        ChainStatus::Completed => DealStatus::Completed,
        ChainStatus::Refunded => DealStatus::Refunded,
        ChainStatus::Listed | ChainStatus::Cancelled => return None,
    })
}

pub fn hex_opt(h: &[u8; 32]) -> Option<String> {
    (*h != [0u8; 32]).then(|| hex::encode(h))
}

fn text_opt(s: &str) -> Option<String> {
    (!s.is_empty()).then(|| s.to_string())
}

fn event_kind(s: DealStatus) -> &'static str {
    match s {
        DealStatus::Paid => "paid",
        DealStatus::Shipped => "shipped",
        DealStatus::Disputed => "disputed",
        DealStatus::ReturnRequested => "return_requested",
        DealStatus::Returning => "returning",
        DealStatus::Completed => "completed",
        DealStatus::Refunded => "refunded",
    }
}

/// The program allows party actions only before the deadline and settle_expired only after it,
/// so the previous status plus "before/after deadline" tells why the deal closed.
pub fn close_reason(
    prev: Option<&Deal>,
    to: DealStatus,
    verdict: ChainVerdict,
    changed_at: Unix,
) -> Option<CloseReason> {
    let before_deadline = prev.and_then(|d| d.deadline_at).is_some_and(|dl| changed_at < dl);
    match (to, prev.map(|d| d.status)) {
        (DealStatus::Completed, _) if verdict == ChainVerdict::Seller => Some(CloseReason::VerdictSeller),
        (DealStatus::Completed, Some(DealStatus::Shipped)) => {
            Some(if before_deadline { CloseReason::Accepted } else { CloseReason::UnboxTimeout })
        }
        (DealStatus::Completed, Some(DealStatus::ReturnRequested)) => Some(CloseReason::ReturnShipTimeout),
        (DealStatus::Refunded, Some(DealStatus::Paid)) => Some(CloseReason::ShipTimeout),
        (DealStatus::Refunded, Some(DealStatus::Returning)) => {
            Some(if before_deadline { CloseReason::ReturnConfirmed } else { CloseReason::ReturnConfirmTimeout })
        }
        _ => prev.and_then(|d| d.close_reason),
    }
}

/// The API document for `listing`'s deal. None when the account is not a deal yet (Listed/Cancelled)
/// or the snapshot is older than the stored one (RPC nodes can lag; webhook and poller race).
pub fn mirror_deal(
    prev: Option<&Deal>,
    listing: &Listing,
    snap: &ChainSnapshot,
    buyer: Party,
    now: Unix,
) -> Option<Deal> {
    let chain = snap.deal;
    let status = model_status(chain.status)?;
    if prev.is_some_and(|p| chain.status_changed_at < p.status_changed_at) {
        return None;
    }
    let mut timeline = prev.map(|p| p.timeline.clone()).unwrap_or_default();
    let mut transactions = prev.and_then(|p| p.onchain.as_ref()).map(|o| o.transactions.clone()).unwrap_or_default();
    if prev.map(|p| p.status) != Some(status) {
        timeline.push(TimelineEvent {
            at: chain.status_changed_at,
            kind: event_kind(status).into(),
            label: status_label(status).into(),
        });
        transactions.push(ChainTx {
            status,
            at: chain.status_changed_at,
            signature: snap.signature.clone(),
            explorer_url: snap.explorer_url.clone(),
        });
    }
    let terminal = matches!(status, DealStatus::Completed | DealStatus::Refunded);
    let payment = Payment {
        status: match status {
            DealStatus::Completed => PaymentStatus::Released,
            DealStatus::Refunded => PaymentStatus::Refunded,
            _ => PaymentStatus::Secured,
        },
        amount_minor: chain.price_lamports as i64,
        currency: "SOL".into(),
        secured_at: prev.map(|p| p.payment.secured_at).unwrap_or(chain.status_changed_at),
        settled_at: terminal.then_some(chain.status_changed_at),
    };
    let verdict = match chain.verdict {
        ChainVerdict::None => None,
        ChainVerdict::Seller => Some(Verdict::Seller),
        ChainVerdict::Buyer => Some(Verdict::Buyer),
    };
    Some(Deal {
        id: listing.id.clone(),
        listing: ListingMetadata::of(listing),
        listing_hash: hex::encode(chain.listing_hash),
        seller_id: listing.seller_id.clone(),
        seller: listing.seller.clone(),
        buyer_id: buyer.id.clone(),
        buyer,
        status,
        status_changed_at: chain.status_changed_at,
        deadline_at: unbox_escrow::logic::deadline(chain.status, chain.status_changed_at),
        payment,
        qr_commitment: hex_opt(&chain.qr_commitment),
        packing_video_sha256: hex_opt(&chain.packing_video_hash),
        tracking_number: text_opt(&chain.tracking_number),
        unboxing_video_sha256: hex_opt(&chain.unboxing_video_hash),
        complaint: prev.and_then(|p| p.complaint.clone()),
        complaint_hash: hex_opt(&chain.complaint_hash),
        analysis: prev.and_then(|p| p.analysis.clone()),
        verdict,
        return_qr_commitment: hex_opt(&chain.return_qr_commitment),
        return_video_sha256: hex_opt(&chain.return_video_hash),
        return_tracking_number: text_opt(&chain.return_tracking_number),
        close_reason: close_reason(prev, status, chain.verdict, chain.status_changed_at),
        timeline,
        created_at: prev.map(|p| p.created_at).unwrap_or(now),
        onchain: Some(OnChainDeal {
            deal: snap.address.to_string(),
            seller_wallet: chain.seller.to_string(),
            buyer_wallet: chain.buyer.to_string(),
            price_lamports: chain.price_lamports,
            transactions,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::Pubkey;
    use unbox_escrow::constants::{SHIP_TIMEOUT, UNBOX_TIMEOUT};

    const PRICE: u64 = 60_000_000;

    fn listing() -> Listing {
        Listing {
            id: "l-kurtka-levis".into(),
            seller_id: "u-ania".into(),
            seller: Party { id: "u-ania".into(), name: "Ania Kowalska".into() },
            title: "Kurtka jeansowa Levi's".into(),
            description: "Klasyczna kurtka.".into(),
            category_id: "odziez-meska".into(),
            condition: Condition::Dobry,
            brand: "Levi's".into(),
            size: "M".into(),
            defects: vec![],
            photos: vec![],
            price_minor: PRICE as i64,
            currency: "SOL".into(),
            status: ListingStatus::Listed,
            created_at: 1,
            updated_at: 1,
            onchain: None,
        }
    }

    fn chain(status: ChainStatus, at: i64) -> ChainDeal {
        ChainDeal {
            seller: Pubkey::new_from_array([1; 32]),
            buyer: Pubkey::new_from_array([2; 32]),
            arbiter: Pubkey::new_from_array([3; 32]),
            deal_id: 1,
            price_lamports: PRICE,
            listing_hash: [5; 32],
            status,
            status_changed_at: at,
            qr_commitment: [0; 32],
            packing_video_hash: [0; 32],
            unboxing_video_hash: [0; 32],
            complaint_hash: [0; 32],
            verdict: ChainVerdict::None,
            report_hash: [0; 32],
            return_qr_commitment: [0; 32],
            return_video_hash: [0; 32],
            bump: 255,
            metadata_uri: String::new(),
            tracking_number: String::new(),
            return_tracking_number: String::new(),
        }
    }

    fn buyer() -> Party {
        Party { id: "u-bartek".into(), name: "Bartek Nowak".into() }
    }

    fn mirror(prev: Option<&Deal>, c: &ChainDeal) -> Option<Deal> {
        let snap = ChainSnapshot {
            address: "PDA",
            deal: c,
            signature: Some("sig1".into()),
            explorer_url: Some("https://x/sig1".into()),
        };
        mirror_deal(prev, &listing(), &snap, buyer(), 999)
    }

    #[test]
    fn listed_and_cancelled_are_not_deals() {
        assert!(mirror(None, &chain(ChainStatus::Listed, 1)).is_none());
        assert!(mirror(None, &chain(ChainStatus::Cancelled, 1)).is_none());
    }

    #[test]
    fn paid_deal_has_secured_sol_payment_and_program_deadline() {
        let d = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        assert_eq!(d.id, "l-kurtka-levis");
        assert_eq!(d.status, DealStatus::Paid);
        assert_eq!(d.deadline_at, Some(100 + SHIP_TIMEOUT));
        assert_eq!(d.payment.status, PaymentStatus::Secured);
        assert_eq!((d.payment.amount_minor, d.payment.currency.as_str()), (PRICE as i64, "SOL"));
        assert_eq!(d.payment.secured_at, 100);
        assert_eq!(d.buyer.id, "u-bartek");
        assert_eq!(d.timeline.len(), 1);
        assert_eq!(d.timeline[0].kind, "paid");
        let onchain = d.onchain.unwrap();
        assert_eq!(onchain.deal, "PDA");
        assert_eq!(onchain.buyer_wallet, Pubkey::new_from_array([2; 32]).to_string());
        assert_eq!(onchain.transactions[0].signature.as_deref(), Some("sig1"));
        assert_eq!(d.created_at, 999);
    }

    #[test]
    fn timeline_once_per_status() {
        let paid = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        let again = mirror(Some(&paid), &chain(ChainStatus::Paid, 100)).unwrap();
        assert_eq!(again.timeline.len(), 1);
        assert_eq!(again.onchain.as_ref().unwrap().transactions.len(), 1);
        let shipped = mirror(Some(&again), &chain(ChainStatus::Shipped, 150)).unwrap();
        let kinds: Vec<_> = shipped.timeline.iter().map(|t| t.kind.as_str()).collect();
        assert_eq!(kinds, ["paid", "shipped"]);
        assert_eq!(shipped.payment.secured_at, 100);
    }

    #[test]
    fn stale_snapshot_is_ignored() {
        let shipped = mirror(None, &chain(ChainStatus::Shipped, 200)).unwrap();
        assert!(mirror(Some(&shipped), &chain(ChainStatus::Paid, 100)).is_none());
    }

    #[test]
    fn completion_after_shipping_depends_on_the_deadline() {
        let shipped = mirror(None, &chain(ChainStatus::Shipped, 200)).unwrap();
        let accepted = mirror(Some(&shipped), &chain(ChainStatus::Completed, 200 + UNBOX_TIMEOUT - 1)).unwrap();
        assert_eq!(accepted.close_reason, Some(CloseReason::Accepted));
        assert_eq!(accepted.payment.status, PaymentStatus::Released);
        assert_eq!(accepted.payment.settled_at, Some(200 + UNBOX_TIMEOUT - 1));
        assert_eq!(accepted.deadline_at, None);
        let expired = mirror(Some(&shipped), &chain(ChainStatus::Completed, 200 + UNBOX_TIMEOUT)).unwrap();
        assert_eq!(expired.close_reason, Some(CloseReason::UnboxTimeout));
    }

    #[test]
    fn refunds_and_verdicts_get_their_close_reason() {
        let paid = mirror(None, &chain(ChainStatus::Paid, 100)).unwrap();
        let refunded = mirror(Some(&paid), &chain(ChainStatus::Refunded, 100 + SHIP_TIMEOUT)).unwrap();
        assert_eq!(refunded.close_reason, Some(CloseReason::ShipTimeout));
        assert_eq!(refunded.payment.status, PaymentStatus::Refunded);

        let disputed = mirror(None, &chain(ChainStatus::Disputed, 300)).unwrap();
        let mut won = chain(ChainStatus::Completed, 310);
        won.verdict = ChainVerdict::Seller;
        let resolved = mirror(Some(&disputed), &won).unwrap();
        assert_eq!(
            (resolved.close_reason, resolved.verdict),
            (Some(CloseReason::VerdictSeller), Some(Verdict::Seller))
        );

        let requested = mirror(None, &chain(ChainStatus::ReturnRequested, 400)).unwrap();
        let kept = mirror(Some(&requested), &chain(ChainStatus::Completed, 5_000)).unwrap();
        assert_eq!(kept.close_reason, Some(CloseReason::ReturnShipTimeout));
    }

    #[test]
    fn hashes_and_texts_are_none_until_set() {
        let mut c = chain(ChainStatus::Shipped, 100);
        let d = mirror(None, &c).unwrap();
        assert_eq!((d.qr_commitment, d.tracking_number), (None, None));
        c.qr_commitment = [0xab; 32];
        c.tracking_number = "INPOST-1".into();
        let d = mirror(None, &c).unwrap();
        assert_eq!(d.qr_commitment, Some("ab".repeat(32)));
        assert_eq!(d.tracking_number.as_deref(), Some("INPOST-1"));
        assert_eq!(hex_opt(&[0; 32]), None);
    }
}
