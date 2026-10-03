//! Konfiguracja z env. Bez wartości sekretów w repo.

use crate::machine::{Timeouts, TIMEOUTS_DEMO, TIMEOUTS_PROD};
use anchor_lang::prelude::Pubkey;
use std::path::{Path, PathBuf};
use std::str::FromStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AiMode {
    Mock,
    Http,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentsMode {
    /// Demo ledger in SQLite (offline demo and the original test suite).
    Demo,
    /// Money and deal status live in the unbox_escrow program; the server only mirrors them.
    Solana,
}

#[derive(Clone, Debug)]
pub struct SolanaConfig {
    pub rpc_url: String,
    /// "devnet" or anything else (Explorer links then use a custom cluster URL).
    pub cluster: String,
    /// Oracle key that new listings name as the arbiter (ORACLE_PUBKEY of person 5).
    pub arbiter: Pubkey,
    /// Helius sends it back verbatim in the Authorization header.
    pub webhook_secret: Option<String>,
    pub poll_ms: u64,
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub production: bool,
    pub ai: AiMode,
    pub ai_url: String,
    pub ai_timeout_ms: u64,
    pub ai_max_attempts: u32,
    pub ai_retry_ms: u64,
    pub mock_ai_delay_ms: u64,
    pub ai_health_ttl_ms: u64,
    pub timeouts_mode: &'static str,
    pub timeouts: Timeouts,
    /// TEST-ONLY: POST /api/dev/clock. Nigdy przy NODE_ENV/APP_ENV=production.
    pub dev_clock: bool,
    pub sweep_ms: u64,
    pub jwt_secret: String,
    pub public_base_url: String,
    pub data_dir: PathBuf,
    pub max_upload_bytes: u64,
    pub payments: PaymentsMode,
    pub solana: Option<SolanaConfig>,
}

fn var(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn num<T: std::str::FromStr>(name: &str, default: T) -> Result<T, String> {
    match var(name) {
        None => Ok(default),
        Some(v) => v.trim().parse().map_err(|_| format!("{name}={v}: oczekiwano liczby")),
    }
}

/// Sekret JWT: z JWT_SECRET, a poza produkcją losowy, zapisany w DATA_DIR/jwt-secret (gitignored),
/// żeby sesje przetrwały restart.
fn jwt_secret(data_dir: &Path, production: bool) -> Result<String, String> {
    if let Some(s) = var("JWT_SECRET") {
        return Ok(s);
    }
    if production {
        return Err("NODE_ENV=production wymaga JWT_SECRET".into());
    }
    let file = data_dir.join("jwt-secret");
    if let Ok(s) = std::fs::read_to_string(&file) {
        if !s.trim().is_empty() {
            return Ok(s.trim().to_string());
        }
    }
    std::fs::create_dir_all(data_dir).map_err(|e| format!("DATA_DIR: {e}"))?;
    let secret = hex::encode(rand::random::<[u8; 32]>());
    std::fs::write(&file, &secret).map_err(|e| format!("jwt-secret: {e}"))?;
    Ok(secret)
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let env_name = var("APP_ENV").or_else(|| var("NODE_ENV")).unwrap_or_default();
        let production = env_name == "production";
        let ai = match var("AI").as_deref().unwrap_or("mock") {
            "mock" => AiMode::Mock,
            "http" => AiMode::Http,
            other => return Err(format!("AI={other}: dozwolone mock|http")),
        };
        let (timeouts_mode, timeouts) = match var("TIMEOUTS").as_deref().unwrap_or("demo") {
            "demo" => ("demo", TIMEOUTS_DEMO),
            "prod" => ("prod", TIMEOUTS_PROD),
            other => return Err(format!("TIMEOUTS={other}: dozwolone demo|prod")),
        };
        let port: u16 = num("PORT", 4000)?;
        let data_dir =
            var("DATA_DIR").map(PathBuf::from).unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("data"));
        let jwt_secret = jwt_secret(&data_dir, production)?;
        let max_upload_mb: f64 = num("MAX_UPLOAD_MB", 60.0)?;
        let payments = match var("PAYMENTS").as_deref().unwrap_or("solana") {
            "solana" => PaymentsMode::Solana,
            "demo" => PaymentsMode::Demo,
            other => return Err(format!("PAYMENTS={other}: dozwolone solana|demo")),
        };
        let solana = match payments {
            PaymentsMode::Demo => None,
            PaymentsMode::Solana => {
                let arbiter = var("ARBITER_PUBKEY").ok_or("PAYMENTS=solana wymaga ARBITER_PUBKEY (klucz wyroczni)")?;
                Some(SolanaConfig {
                    rpc_url: var("RPC_URL").unwrap_or_else(|| "https://api.devnet.solana.com".into()),
                    cluster: var("CLUSTER").unwrap_or_else(|| "devnet".into()),
                    arbiter: Pubkey::from_str(&arbiter)
                        .map_err(|_| format!("ARBITER_PUBKEY={arbiter}: niepoprawny adres"))?,
                    webhook_secret: var("WEBHOOK_SECRET"),
                    poll_ms: num("SOLANA_POLL_MS", 5000)?,
                })
            }
        };
        Ok(Self {
            port,
            production,
            ai,
            ai_url: var("AI_URL").unwrap_or_else(|| "http://localhost:8000".into()).trim_end_matches('/').to_string(),
            ai_timeout_ms: num("AI_TIMEOUT_MS", 120_000)?,
            ai_max_attempts: num("AI_MAX_ATTEMPTS", 3)?,
            ai_retry_ms: num("AI_RETRY_MS", 2000)?,
            mock_ai_delay_ms: num("MOCK_AI_DELAY_MS", 3000)?,
            ai_health_ttl_ms: num("AI_HEALTH_TTL_MS", 30_000)?,
            timeouts_mode,
            timeouts,
            dev_clock: !production && (env_name == "test" || var("ENABLE_DEV_CLOCK").as_deref() == Some("1")),
            sweep_ms: num("SWEEP_MS", 5000)?,
            jwt_secret,
            public_base_url: var("PUBLIC_BASE_URL")
                .unwrap_or_else(|| format!("http://localhost:{port}"))
                .trim_end_matches('/')
                .to_string(),
            data_dir,
            // Liczba całkowita bajtów (ułamkowe MB są zaokrąglane w dół).
            max_upload_bytes: (max_upload_mb * 1024.0 * 1024.0).floor() as u64,
            payments,
            solana,
        })
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join("unbox.db")
    }
    pub fn media_dir(&self) -> PathBuf {
        self.data_dir.join("media")
    }
    pub fn tmp_dir(&self) -> PathBuf {
        self.data_dir.join("tmp")
    }
    pub fn media_url(&self, sha: &str) -> String {
        format!("{}/media/{}", self.public_base_url, sha)
    }
}
