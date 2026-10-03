//! PAYMENTS=solana: the money and the rules live in the `unbox_escrow` program. This module only reads
//! accounts over RPC and mirrors them into SQLite; it never signs or sends a transaction.
pub mod chain;
pub mod mirror;

use crate::config::{PaymentsMode, SolanaConfig};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;

pub fn explorer_tx_url(signature: &str, cfg: &SolanaConfig) -> String {
    if cfg.cluster == "devnet" {
        format!("https://explorer.solana.com/tx/{signature}?cluster=devnet")
    } else {
        format!("https://explorer.solana.com/tx/{signature}?cluster=custom&customUrl={}", cfg.rpc_url)
    }
}

/// The REST actions move money in the demo ledger, so in PAYMENTS=solana the wallet signs them instead.
pub fn demo_only(s: &AppState) -> ApiResult<()> {
    if s.cfg.payments == PaymentsMode::Solana {
        Err(ApiError::invalid_state("W trybie Solana tę operację podpisujesz w portfelu w aplikacji"))
    } else {
        Ok(())
    }
}
