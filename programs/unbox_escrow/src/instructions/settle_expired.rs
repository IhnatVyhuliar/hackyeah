use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::logic::{deadline, expiry_outcome, Payee};
use crate::state::Deal;

#[derive(Accounts)]
pub struct SettleExpired<'info> {
    /// Anyone: nobody has to "guard" the deal.
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = seller @ UnboxError::Unauthorized,
        has_one = buyer @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: payee; `has_one = buyer` pins the address.
    #[account(mut)]
    pub buyer: UncheckedAccount<'info>,
}

pub fn handle_settle_expired(ctx: Context<SettleExpired>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    let (to, payee) = expiry_outcome(deal.status).ok_or(error!(UnboxError::InvalidStatus))?;
    let end = deadline(deal.status, deal.status_changed_at).ok_or(error!(UnboxError::InvalidStatus))?;
    require!(now >= end, UnboxError::DeadlineNotReached);
    let price = deal.price_lamports;
    match payee {
        Payee::Seller => {
            ctx.accounts.deal.sub_lamports(price)?;
            ctx.accounts.seller.add_lamports(price)?;
        }
        Payee::Buyer => {
            ctx.accounts.deal.sub_lamports(price)?;
            ctx.accounts.buyer.add_lamports(price)?;
        }
        Payee::Nobody => {}
    }
    ctx.accounts.deal.set_status(key, to, now);
    Ok(())
}
