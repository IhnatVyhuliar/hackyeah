use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

#[derive(Accounts)]
pub struct MarkReturned<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_mark_returned(
    _ctx: Context<MarkReturned>,
    _return_qr_commitment: [u8; 32],
    _return_video_hash: [u8; 32],
    _return_tracking_number: String,
) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
