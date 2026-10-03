use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::constants::*;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

/// Shipping QR commitment: sha256(deal_pubkey || secret).
pub fn ship_commitment(deal: &Pubkey, secret: &[u8; 32]) -> [u8; 32] {
    hashv(&[deal.as_ref(), &secret[..]]).to_bytes()
}

/// Return QR commitment: sha256("return" || deal_pubkey || secret); the prefix separates it from shipping.
pub fn return_commitment(deal: &Pubkey, secret: &[u8; 32]) -> [u8; 32] {
    hashv(&[b"return", deal.as_ref(), &secret[..]]).to_bytes()
}

pub fn timeout_for(status: DealStatus) -> Option<i64> {
    match status {
        DealStatus::Paid => Some(SHIP_TIMEOUT),
        DealStatus::Shipped => Some(UNBOX_TIMEOUT),
        DealStatus::Disputed => Some(ORACLE_TIMEOUT),
        DealStatus::ReturnRequested => Some(RETURN_SHIP_TIMEOUT),
        DealStatus::Returning => Some(RETURN_CONFIRM_TIMEOUT),
        DealStatus::Listed | DealStatus::Completed | DealStatus::Refunded | DealStatus::Cancelled => None,
    }
}

pub fn deadline(status: DealStatus, changed_at: i64) -> Option<i64> {
    timeout_for(status).map(|t| changed_at + t)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Payee {
    Seller,
    Buyer,
    Nobody,
}

/// What `settle_expired` does after the deadline (CLAUDE.md §4). Anyone may trigger it.
pub fn expiry_outcome(status: DealStatus) -> Option<(DealStatus, Payee)> {
    match status {
        DealStatus::Paid => Some((DealStatus::Refunded, Payee::Buyer)),
        DealStatus::Shipped => Some((DealStatus::Completed, Payee::Seller)),
        DealStatus::Disputed => Some((DealStatus::ReturnRequested, Payee::Nobody)),
        DealStatus::ReturnRequested => Some((DealStatus::Completed, Payee::Seller)),
        DealStatus::Returning => Some((DealStatus::Refunded, Payee::Buyer)),
        _ => None,
    }
}

/// Party actions need `now < deadline`; `settle_expired` needs `now >= deadline`, so there is no race.
pub fn require_before_deadline(deal: &Deal, now: i64) -> Result<()> {
    let end = deadline(deal.status, deal.status_changed_at).ok_or(error!(UnboxError::InvalidStatus))?;
    require!(now < end, UnboxError::DeadlinePassed);
    Ok(())
}

pub fn require_hash(hash: &[u8; 32]) -> Result<()> {
    require!(*hash != [0u8; 32], UnboxError::EmptyHash);
    Ok(())
}

pub fn require_text(text: &str, max: usize) -> Result<()> {
    require!(!text.is_empty(), UnboxError::EmptyText);
    require!(text.len() <= max, UnboxError::StringTooLong);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    // Vectors from docs/zadania/README.md: deal = bytes 1..=32, secret = 32 x 0xab.
    fn vector_deal() -> Pubkey {
        let mut bytes = [0u8; 32];
        for (i, b) in bytes.iter_mut().enumerate() {
            *b = i as u8 + 1;
        }
        Pubkey::new_from_array(bytes)
    }

    #[test]
    fn vector_deal_base58() {
        assert_eq!(vector_deal().to_string(), "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw");
    }

    #[test]
    fn ship_commitment_matches_vector() {
        assert_eq!(
            hex(&ship_commitment(&vector_deal(), &[0xab; 32])),
            "53c95ae0a78bfd76222068846946ee779ca3d184074836c3586cd0fa91ff7977"
        );
    }

    #[test]
    fn return_commitment_matches_vector() {
        assert_eq!(
            hex(&return_commitment(&vector_deal(), &[0xab; 32])),
            "5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d"
        );
    }

    #[test]
    fn deadline_only_for_timed_statuses() {
        assert_eq!(deadline(DealStatus::Paid, 100), Some(100 + SHIP_TIMEOUT));
        assert_eq!(deadline(DealStatus::Shipped, 100), Some(100 + UNBOX_TIMEOUT));
        assert_eq!(deadline(DealStatus::Disputed, 100), Some(100 + ORACLE_TIMEOUT));
        assert_eq!(deadline(DealStatus::ReturnRequested, 100), Some(100 + RETURN_SHIP_TIMEOUT));
        assert_eq!(deadline(DealStatus::Returning, 100), Some(100 + RETURN_CONFIRM_TIMEOUT));
        for s in [DealStatus::Listed, DealStatus::Completed, DealStatus::Refunded, DealStatus::Cancelled] {
            assert_eq!(deadline(s, 100), None);
        }
    }

    #[test]
    fn expiry_outcome_follows_claude_md_table() {
        use DealStatus::*;
        assert_eq!(expiry_outcome(Paid), Some((Refunded, Payee::Buyer)));
        assert_eq!(expiry_outcome(Shipped), Some((Completed, Payee::Seller)));
        assert_eq!(expiry_outcome(Disputed), Some((ReturnRequested, Payee::Nobody)));
        assert_eq!(expiry_outcome(ReturnRequested), Some((Completed, Payee::Seller)));
        assert_eq!(expiry_outcome(Returning), Some((Refunded, Payee::Buyer)));
        for s in [Listed, Completed, Refunded, Cancelled] {
            assert_eq!(expiry_outcome(s), None);
        }
    }

    #[test]
    fn deadline_boundary_is_exclusive_for_parties() {
        let mut deal = sample_deal();
        deal.status = DealStatus::Paid;
        deal.status_changed_at = 1_000;
        assert!(require_before_deadline(&deal, 1_000 + SHIP_TIMEOUT - 1).is_ok());
        assert!(require_before_deadline(&deal, 1_000 + SHIP_TIMEOUT).is_err());
        deal.status = DealStatus::Listed;
        assert!(require_before_deadline(&deal, 0).is_err());
    }

    #[test]
    fn hash_and_text_guards() {
        assert!(require_hash(&[0u8; 32]).is_err());
        assert!(require_hash(&[1u8; 32]).is_ok());
        assert!(require_text("", 32).is_err());
        assert!(require_text(&"x".repeat(33), 32).is_err());
        assert!(require_text("INPOST123", 32).is_ok());
    }

    #[cfg(all(feature = "demo", not(feature = "test-timeouts")))]
    #[test]
    fn demo_profile_values() {
        assert_eq!(TIMEOUT_PROFILE, "demo");
        assert_eq!((SHIP_TIMEOUT, UNBOX_TIMEOUT, ORACLE_TIMEOUT), (600, 3600, 600));
        assert_eq!((RETURN_SHIP_TIMEOUT, RETURN_CONFIRM_TIMEOUT), (600, 600));
    }

    fn sample_deal() -> Deal {
        Deal {
            seller: Pubkey::new_unique(),
            buyer: Pubkey::default(),
            arbiter: Pubkey::new_unique(),
            deal_id: 1,
            price_lamports: 1,
            listing_hash: [1; 32],
            status: DealStatus::Listed,
            status_changed_at: 0,
            qr_commitment: [0; 32],
            packing_video_hash: [0; 32],
            unboxing_video_hash: [0; 32],
            complaint_hash: [0; 32],
            verdict: crate::state::Verdict::None,
            report_hash: [0; 32],
            return_qr_commitment: [0; 32],
            return_video_hash: [0; 32],
            bump: 255,
            metadata_uri: String::new(),
            tracking_number: String::new(),
            return_tracking_number: String::new(),
        }
    }
}
