use anchor_lang::prelude::*;

use crate::constants::{DEAL_SEED, MAX_METADATA_URI_LEN};
use crate::errors::UnboxError;
use crate::events::DealStatusChanged;
use crate::logic::{require_hash, require_text};
use crate::state::{Deal, DealStatus};

#[derive(Accounts)]
#[instruction(deal_id: u64)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer = seller,
        space = Deal::DISCRIMINATOR.len() + Deal::INIT_SPACE,
        seeds = [DEAL_SEED, seller.key().as_ref(), &deal_id.to_le_bytes()],
        bump
    )]
    pub deal: Account<'info, Deal>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_listing(
    ctx: Context<CreateListing>,
    deal_id: u64,
    price_lamports: u64,
    listing_hash: [u8; 32],
    metadata_uri: String,
    arbiter: Pubkey,
) -> Result<()> {
    require!(price_lamports > 0, UnboxError::InvalidPrice);
    require_hash(&listing_hash)?;
    require_text(&metadata_uri, MAX_METADATA_URI_LEN)?;
    let now = Clock::get()?.unix_timestamp;
    let key = ctx.accounts.deal.key();
    let deal = &mut ctx.accounts.deal;
    deal.seller = ctx.accounts.seller.key();
    deal.arbiter = arbiter;
    deal.deal_id = deal_id;
    deal.price_lamports = price_lamports;
    deal.listing_hash = listing_hash;
    deal.metadata_uri = metadata_uri;
    deal.status = DealStatus::Listed;
    deal.status_changed_at = now;
    deal.bump = ctx.bumps.deal;
    emit!(DealStatusChanged { deal: key, from: DealStatus::Listed, to: DealStatus::Listed, at: now });
    Ok(())
}
