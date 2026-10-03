use anchor_lang::prelude::*;

use crate::constants::{DEAL_SEED, MAX_TRACKING_LEN};
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, require_hash, require_text};
use crate::state::{Deal, DealStatus};

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
    ctx: Context<MarkShipped>,
    qr_commitment: [u8; 32],
    packing_video_hash: [u8; 32],
    tracking_number: String,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Paid, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    require_hash(&qr_commitment)?;
    require_hash(&packing_video_hash)?;
    require_text(&tracking_number, MAX_TRACKING_LEN)?;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.qr_commitment = qr_commitment;
    deal.packing_video_hash = packing_video_hash;
    deal.tracking_number = tracking_number;
    deal.set_status(key, DealStatus::Shipped, now);
    Ok(())
}
