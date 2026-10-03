use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod logic;
pub mod state;

declare_id!("CEoTTEq46mxFrNqPu9EbpFbDshsrSTZV9GB14XPT1Nyq");

#[program]
pub mod unbox_escrow {}
