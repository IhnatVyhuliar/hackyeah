use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, return_commitment};
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct ConfirmReturn<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = buyer` pins the address.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
}

pub fn handle_confirm_return(ctx: Context<ConfirmReturn>, return_qr_secret: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Returning, UnboxError::InvalidStatus);
    // Party actions only before the deadline; after it settle_expired refunds the buyer the same way.
    require_before_deadline(deal, now)?;
    require!(return_commitment(&key, &return_qr_secret) == deal.return_qr_commitment, UnboxError::QrMismatch);
    let price = deal.price_lamports;
    ctx.accounts.deal.sub_lamports(price)?;
    ctx.accounts.buyer.add_lamports(price)?;
    ctx.accounts.deal.set_status(key, DealStatus::Refunded, now);
    Ok(())
}
