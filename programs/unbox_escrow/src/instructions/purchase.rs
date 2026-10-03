use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
pub struct Purchase<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEAL_SEED, deal.seller.as_ref(), &deal.deal_id.to_le_bytes()],
        bump = deal.bump
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

pub fn handle_purchase(
    ctx: Context<Purchase>,
    expected_listing_hash: [u8; 32],
    expected_arbiter: Pubkey,
) -> Result<()> {
    let deal = &ctx.accounts.deal;
    require!(deal.status == DealStatus::Listed, UnboxError::InvalidStatus);
    require_keys_neq!(ctx.accounts.buyer.key(), deal.seller, UnboxError::SameParty);
    // The buyer signs the exact description and arbiter they were shown.
    require!(expected_listing_hash == deal.listing_hash, UnboxError::ListingHashMismatch);
    require_keys_eq!(expected_arbiter, deal.arbiter, UnboxError::ArbiterMismatch);
    let price = deal.price_lamports;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            Transfer { from: ctx.accounts.buyer.to_account_info(), to: ctx.accounts.deal.to_account_info() },
        ),
        price,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let buyer = ctx.accounts.buyer.key();
    let deal = &mut ctx.accounts.deal;
    deal.buyer = buyer;
    deal.set_status(key, DealStatus::Paid, now);
    Ok(())
}
