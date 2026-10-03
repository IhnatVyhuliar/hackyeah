use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct OpenDispute<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_open_dispute(
    _ctx: Context<OpenDispute>,
    _qr_secret: [u8; 32],
    _unboxing_video_hash: [u8; 32],
    _complaint_hash: [u8; 32],
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
