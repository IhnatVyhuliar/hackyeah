use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::logic::{require_before_deadline, require_hash};
use crate::state::{Deal, DealStatus, Verdict};

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

pub fn handle_resolve_dispute(ctx: Context<ResolveDispute>, verdict: Verdict, report_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Disputed, UnboxError::InvalidStatus);
    // After ORACLE_TIMEOUT the oracle is out; settle_expired takes the neutral path.
    require_before_deadline(deal, now)?;
    require!(verdict != Verdict::None, UnboxError::InvalidVerdict);
    require_hash(&report_hash)?;
    let to = if verdict == Verdict::Seller {
        let price = deal.price_lamports;
        ctx.accounts.deal.sub_lamports(price)?;
        ctx.accounts.seller.add_lamports(price)?;
        DealStatus::Completed
    } else {
        DealStatus::ReturnRequested
    };
    let deal = &mut ctx.accounts.deal;
    deal.verdict = verdict;
    deal.report_hash = report_hash;
    deal.set_status(key, to, now);
    Ok(())
}
