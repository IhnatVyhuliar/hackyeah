use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, require_hash, ship_commitment};
use crate::state::{Deal, DealStatus};

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
    ctx: Context<OpenDispute>,
    qr_secret: [u8; 32],
    unboxing_video_hash: [u8; 32],
    complaint_hash: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Shipped, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    // Revealing the secret in the same tx as the decision makes the QR single-use.
    require!(ship_commitment(&key, &qr_secret) == deal.qr_commitment, UnboxError::QrMismatch);
    require_hash(&unboxing_video_hash)?;
    require_hash(&complaint_hash)?;
    let deal = &mut ctx.accounts.deal;
    deal.unboxing_video_hash = unboxing_video_hash;
    deal.complaint_hash = complaint_hash;
    deal.set_status(key, DealStatus::Disputed, now);
    Ok(())
}
