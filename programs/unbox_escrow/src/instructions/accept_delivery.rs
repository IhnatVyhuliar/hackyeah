use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, ship_commitment};
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct AcceptDelivery<'info> {
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = buyer @ UnboxError::Unauthorized,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
}

pub fn handle_accept_delivery(ctx: Context<AcceptDelivery>, qr_secret: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Shipped, UnboxError::InvalidStatus);
    require_before_deadline(deal, now)?;
    // The secret is revealed in the same tx as the decision and the status changes, so the QR is single-use.
    require!(ship_commitment(&key, &qr_secret) == deal.qr_commitment, UnboxError::QrMismatch);
    let price = deal.price_lamports;
    ctx.accounts.deal.sub_lamports(price)?;
    ctx.accounts.seller.add_lamports(price)?;
    ctx.accounts.deal.set_status(key, DealStatus::Completed, now);
    Ok(())
}
