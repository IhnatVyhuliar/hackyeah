use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct MarkShipped<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_mark_shipped(
    _ctx: Context<MarkShipped>,
    _qr_commitment: [u8; 32],
    _packing_video_hash: [u8; 32],
    _tracking_number: String,
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
