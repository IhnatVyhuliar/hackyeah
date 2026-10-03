use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
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

pub fn handle_settle_expired(_ctx: Context<SettleExpired>) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
