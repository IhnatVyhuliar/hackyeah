use crate::ai::Ai;
use crate::config::Config;
use crate::model::Unix;
use crate::solana::chain::RpcChain;
use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Default)]
pub struct DisputeState {
    pub running: Mutex<HashSet<String>>,
    /// AI=mock: scenariusz z nagłówka X-Demo-Scenario per transakcja.
    pub scenarios: Mutex<HashMap<String, String>>,
}

pub struct AiStatus {
    pub text: String,
    pub checked_at_ms: i64,
    pub checking: bool,
}

#[derive(Default, Clone)]
pub struct ChainSync {
    pub last_sync_at: Option<Unix>,
    pub last_error: Option<String>,
}

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    db: Arc<Mutex<Connection>>,
    clock_offset: Arc<AtomicI64>,
    pub ai: Arc<Ai>,
    pub disputes: Arc<DisputeState>,
    pub ai_status: Arc<Mutex<AiStatus>>,
    /// PAYMENTS=solana: read-only RPC client; None in demo mode.
    pub chain: Option<Arc<RpcChain>>,
    pub chain_sync: Arc<Mutex<ChainSync>>,
}

pub fn unix_now() -> Unix {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

impl AppState {
    pub fn new(cfg: Config, conn: Connection) -> Self {
        let ai = Ai::from_config(&cfg);
        let initial = if cfg.ai == crate::config::AiMode::Mock { "mock" } else { "http (jeszcze nie sprawdzono)" };
        let chain = cfg.solana.as_ref().map(|s| Arc::new(RpcChain::new(&s.rpc_url)));
        Self {
            cfg: Arc::new(cfg),
            db: Arc::new(Mutex::new(conn)),
            clock_offset: Arc::new(AtomicI64::new(0)),
            ai: Arc::new(ai),
            disputes: Arc::new(DisputeState::default()),
            ai_status: Arc::new(Mutex::new(AiStatus { text: initial.into(), checked_at_ms: 0, checking: false })),
            chain,
            chain_sync: Arc::new(Mutex::new(ChainSync::default())),
        }
    }

    /// Jedno połączenie SQLite: blokada serializuje operacje (krótkie, synchroniczne, bez await).
    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Jedyne źródło czasu backendu (terminy). Przesunięcie tylko w trybie testowym.
    pub fn now(&self) -> Unix {
        unix_now() + self.clock_offset.load(Ordering::SeqCst)
    }

    /// TEST-ONLY.
    pub fn advance_clock(&self, secs: i64) -> Option<Unix> {
        if !self.cfg.dev_clock {
            return None;
        }
        self.clock_offset.fetch_add(secs, Ordering::SeqCst);
        Some(self.now())
    }
}
