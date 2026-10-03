use anchor_lang::prelude::*;

use crate::events::DealStatusChanged;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum DealStatus {
    Listed,
    Paid,
    Shipped,
    Disputed,
    ReturnRequested,
    Returning,
    Completed,
    Refunded,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub enum Verdict {
    None,
    Seller,
    Buyer,
}

/// One account per listing; it also holds the escrowed lamports.
/// Strings are last so `status` sits at a fixed offset (STATUS_OFFSET) for memcmp filters.
#[account]
#[derive(InitSpace, Debug)]
pub struct Deal {
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub arbiter: Pubkey,
    pub deal_id: u64,
    pub price_lamports: u64,
    pub listing_hash: [u8; 32],
    pub status: DealStatus,
    pub status_changed_at: i64,
    pub qr_commitment: [u8; 32],
    pub packing_video_hash: [u8; 32],
    pub unboxing_video_hash: [u8; 32],
    pub complaint_hash: [u8; 32],
    pub verdict: Verdict,
    pub report_hash: [u8; 32],
    pub return_qr_commitment: [u8; 32],
    pub return_video_hash: [u8; 32],
    pub bump: u8,
    #[max_len(200)]
    pub metadata_uri: String,
    #[max_len(32)]
    pub tracking_number: String,
    #[max_len(32)]
    pub return_tracking_number: String,
}

/// 8-byte discriminator + seller, buyer, arbiter + deal_id, price_lamports + listing_hash.
pub const STATUS_OFFSET: usize = 8 + 32 * 3 + 8 * 2 + 32;

impl Deal {
    /// The only way to change status, so deadlines (`status_changed_at`) and the event never drift.
    pub fn set_status(&mut self, deal: Pubkey, to: DealStatus, now: i64) {
        let from = self.status;
        self.status = to;
        self.status_changed_at = now;
        emit!(DealStatusChanged { deal, from, to, at: now });
    }
}
