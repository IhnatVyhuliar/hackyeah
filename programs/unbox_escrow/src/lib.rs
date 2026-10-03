use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod logic;
pub mod state;

pub use instructions::*;
pub use state::Verdict;

declare_id!("CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq");

#[program]
pub mod unbox_escrow {
    use super::*;

    pub fn create_listing(
        ctx: Context<CreateListing>,
        deal_id: u64,
        price_lamports: u64,
        listing_hash: [u8; 32],
        metadata_uri: String,
        arbiter: Pubkey,
    ) -> Result<()> {
        handle_create_listing(ctx, deal_id, price_lamports, listing_hash, metadata_uri, arbiter)
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        handle_cancel_listing(ctx)
    }

    pub fn purchase(ctx: Context<Purchase>, expected_listing_hash: [u8; 32], expected_arbiter: Pubkey) -> Result<()> {
        handle_purchase(ctx, expected_listing_hash, expected_arbiter)
    }

    pub fn mark_shipped(
        ctx: Context<MarkShipped>,
        qr_commitment: [u8; 32],
        packing_video_hash: [u8; 32],
        tracking_number: String,
    ) -> Result<()> {
        handle_mark_shipped(ctx, qr_commitment, packing_video_hash, tracking_number)
    }

    pub fn accept_delivery(ctx: Context<AcceptDelivery>, qr_secret: [u8; 32]) -> Result<()> {
        handle_accept_delivery(ctx, qr_secret)
    }

    pub fn open_dispute(
        ctx: Context<OpenDispute>,
        qr_secret: [u8; 32],
        unboxing_video_hash: [u8; 32],
        complaint_hash: [u8; 32],
    ) -> Result<()> {
        handle_open_dispute(ctx, qr_secret, unboxing_video_hash, complaint_hash)
    }

    // The arbiter can only pick a side, only while Disputed, only before ORACLE_TIMEOUT.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, verdict: Verdict, report_hash: [u8; 32]) -> Result<()> {
        handle_resolve_dispute(ctx, verdict, report_hash)
    }

    pub fn mark_returned(
        ctx: Context<MarkReturned>,
        return_qr_commitment: [u8; 32],
        return_video_hash: [u8; 32],
        return_tracking_number: String,
    ) -> Result<()> {
        handle_mark_returned(ctx, return_qr_commitment, return_video_hash, return_tracking_number)
    }

    pub fn confirm_return(ctx: Context<ConfirmReturn>, return_qr_secret: [u8; 32]) -> Result<()> {
        handle_confirm_return(ctx, return_qr_secret)
    }

    // Here the intermediary disappears: after a deadline anyone closes the deal by the fixed table.
    pub fn settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
        handle_settle_expired(ctx)
    }
}
