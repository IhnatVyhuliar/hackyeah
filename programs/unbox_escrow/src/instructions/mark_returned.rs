use anchor_lang::prelude::*;

use crate::constants::{DEAL_SEED, MAX_TRACKING_LEN};
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, require_hash, require_text};
use crate::state::{Deal, DealStatus};

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
    ctx: Context<MarkReturned>,
    return_qr_commitment: [u8; 32],
    return_video_hash: [u8; 32],
    return_tracking_number: String,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::ReturnRequested, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    require_hash(&return_qr_commitment)?;
    require_hash(&return_video_hash)?;
    require_text(&return_tracking_number, MAX_TRACKING_LEN)?;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.return_qr_commitment = return_qr_commitment;
    deal.return_video_hash = return_video_hash;
    deal.return_tracking_number = return_tracking_number;
    deal.set_status(key, DealStatus::Returning, now);
    Ok(())
}
