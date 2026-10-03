use std::net::SocketAddr;
use unbox_server::{build, config::Config, seed, spawn_background};

#[tokio::main]
async fn main() {
    let quiet = std::env::var("QUIET").is_ok_and(|v| !v.is_empty());
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            if quiet {
                "warn".into()
            } else {
                "info".into()
            }
        }))
        .init();

    let cfg = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Błąd konfiguracji: {e}");
            std::process::exit(2);
        }
    };
    let (port, ai, timeouts, dev_clock) = (cfg.port, cfg.ai, cfg.timeouts_mode, cfg.dev_clock);
    let (app, state) = match build(cfg).await {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Start nie powiódł się: {e}");
            std::process::exit(1);
        }
    };

    // `unbox-server seed-reset`: czyści bazę, zakłada dane demo i kończy.
    if std::env::args().nth(1).as_deref() == Some("seed-reset") {
        if let Err(e) = seed::seed(&state, true).await {
            eprintln!("seed: {}", e.message);
            std::process::exit(1);
        }
        println!("Baza wyczyszczona i zaseedowana.");
        return;
    }

    spawn_background(&state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Nie można nasłuchiwać na {addr}: {e}");
            std::process::exit(1);
        }
    };
    tracing::info!(
        "unbox API :{port}  AI={:?}  TIMEOUTS={timeouts}{}",
        ai,
        if dev_clock { "  DEV_CLOCK=on (test-only)" } else { "" }
    );
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Serwer zakończył się błędem: {e}");
        std::process::exit(1);
    }
}
