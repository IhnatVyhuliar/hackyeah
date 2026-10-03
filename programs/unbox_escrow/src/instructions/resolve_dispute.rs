use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, Verdict};

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub arbiter: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump,
        has_one = arbiter @ UnboxError::Unauthorized,
        has_one = seller @ UnboxError::Unauthorized
    )]
    pub deal: Account<'info, Deal>,
    /// CHECK: payee; `has_one = seller` pins the address.
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
}

pub fn handle_resolve_dispute(_ctx: Context<ResolveDispute>, _verdict: Verdict, _report_hash: [u8; 32]) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
