//! unbox — backend sklepu: HTTP API (axum), SQLite (rusqlite), demo-płatności, ocena reklamacji.
//! Niezależny od blockchaina.

pub mod ai;
pub mod auth;
pub mod config;
pub mod db;
pub mod deals;
pub mod disputes;
pub mod error;
pub mod machine;
pub mod model;
pub mod routes;
pub mod seed;
pub mod state;
pub mod upload;
pub mod wallet;

use std::time::Duration;

/// Buduje stan aplikacji (baza, seed) i router. Używane przez `main` i testy.
pub async fn build(cfg: config::Config) -> Result<(axum::Router, state::AppState), String> {
    for dir in [cfg.data_dir.clone(), cfg.media_dir(), cfg.tmp_dir()] {
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let conn = db::open(&cfg.db_path()).map_err(|e| format!("baza danych: {e}"))?;
    let state = state::AppState::new(cfg, conn);
    seed::seed(&state, false).await.map_err(|e| e.message)?;
    Ok((routes::router(state.clone()), state))
}

/// Zadania w tle: domykanie transakcji po terminie i wznowienie przerwanych ocen.
pub fn spawn_background(state: &state::AppState) {
    disputes::resume_pending(state);
    let s = state.clone();
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(s.cfg.sweep_ms.max(100)));
        loop {
            tick.tick().await;
            if let Err(e) = deals::sweep_expired(&s) {
                tracing::error!("sweep: {}", e.message);
            }
        }
    });
}
