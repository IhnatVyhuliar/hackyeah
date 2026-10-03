use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
}

pub fn handle_cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    require!(ctx.accounts.deal.status == DealStatus::Listed, UnboxError::InvalidStatus);
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    ctx.accounts.deal.set_status(key, DealStatus::Cancelled, now);
    Ok(())
}
