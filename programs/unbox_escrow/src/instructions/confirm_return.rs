use anchor_lang::prelude::*;

use crate::constants::DEAL_SEED;
use crate::errors::UnboxError;
use crate::state::Deal;

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

pub fn handle_confirm_return(_ctx: Context<ConfirmReturn>, _return_qr_secret: [u8; 32]) -> Result<()> {
    err!(UnboxError::NotImplemented)
}
