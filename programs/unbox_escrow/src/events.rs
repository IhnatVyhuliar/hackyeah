use anchor_lang::prelude::*;

use crate::state::DealStatus;

#[event]
pub struct DealStatusChanged {
    pub deal: Pubkey,
    pub from: DealStatus,
    pub to: DealStatus,
    pub at: i64,
}
