//! Ocena reklamacji: AI zwraca raport, backend go waliduje, sprawdza hasze ocenionych nagrań,
//! liczy werdykt deterministycznym `decide()` i dopiero wtedy zmienia stan transakcji.
//! Błędny raport albo awaria AI nie zmieniają stanu (po terminie: neutralny zwrot towaru).

use crate::db;
use crate::deals::{apply_action, get_deal};
use crate::machine::{self, DealAction};
use crate::model::*;
use crate::state::AppState;
use serde_json::Value;
use std::time::Duration;

fn set_analysis(state: &AppState, id: &str, f: impl FnOnce(&mut Analysis)) {
    let now = state.now();
    let mut conn = state.conn();
    let r = db::tx(&mut conn, |c| {
        let mut d = get_deal(c, id)?;
        let mut a = d.analysis.clone().unwrap_or(Analysis {
            status: AnalysisStatus::Pending,
            attempts: 0,
            error: None,
            report: None,
            report_hash: None,
            model: None,
            prompt_version: None,
            verdict: None,
            updated_at: now,
        });
        f(&mut a);
        a.updated_at = now;
        d.analysis = Some(a);
        db::doc_put(c, "deal", id, &d)
    });
    if let Err(e) = r {
        tracing::error!("analysis {id}: {}", e.message);
    }
}

/// Sprawdza odpowiedź AI: schemat i zgodność haszy ocenionych nagrań z transakcją.
pub fn verify(d: &Deal, raw: Value) -> Result<OracleResponse, String> {
    let r: OracleResponse =
        serde_json::from_value(raw).map_err(|e| format!("Raport AI niezgodny ze schematem: {e}"))?;
    if !machine::is_hex32(&r.evidence.packing_video_sha256)
        || Some(&r.evidence.packing_video_sha256) != d.packing_video_sha256.as_ref()
        || Some(&r.evidence.unboxing_video_sha256) != d.unboxing_video_sha256.as_ref()
    {
        return Err("Raport AI dotyczy innych nagrań niż zapisane w transakcji".into());
    }
    Ok(r)
}

fn request_for(state: &AppState, d: &Deal) -> Option<OracleRequest> {
    let packing = d.packing_video_sha256.clone()?;
    let unboxing = d.unboxing_video_sha256.clone()?;
    Some(OracleRequest {
        deal_id: d.id.clone(),
        listing: d.listing.clone(),
        listing_hash: d.listing_hash.clone(),
        tracking_number: d.tracking_number.clone(),
        packing_video: EvidenceFile { url: state.cfg.media_url(&packing), sha256: packing },
        unboxing_video: EvidenceFile { url: state.cfg.media_url(&unboxing), sha256: unboxing },
        complaint: d.complaint.clone()?,
    })
}

pub fn start_analysis(state: &AppState, id: &str, scenario: Option<String>) {
    if let Some(s) = scenario {
        state.disputes.scenarios.lock().unwrap_or_else(|p| p.into_inner()).insert(id.to_string(), s);
    }
    if !state.disputes.running.lock().unwrap_or_else(|p| p.into_inner()).insert(id.to_string()) {
        return; // już trwa
    }
    let state = state.clone();
    let id = id.to_string();
    tokio::spawn(async move {
        run_analysis(&state, &id).await;
        state.disputes.running.lock().unwrap_or_else(|p| p.into_inner()).remove(&id);
    });
}

async fn run_analysis(state: &AppState, id: &str) {
    let start = {
        let conn = state.conn();
        match get_deal(&conn, id) {
            Ok(d) => d.analysis.map(|a| a.attempts).unwrap_or(0) + 1,
            Err(_) => return,
        }
    };
    let max = state.cfg.ai_max_attempts.max(1);
    for attempt in start..=max {
        let d = match get_deal(&state.conn(), id) {
            Ok(d) => d,
            Err(_) => return,
        };
        if d.status != DealStatus::Disputed {
            return;
        }
        set_analysis(state, id, |a| {
            a.status = AnalysisStatus::Pending;
            a.attempts = attempt;
        });
        let scenario = state.disputes.scenarios.lock().unwrap_or_else(|p| p.into_inner()).get(id).cloned();
        let error = match request_for(state, &d) {
            None => "Brak dowodów w transakcji".to_string(),
            Some(req) => match state.ai.analyze(&req, scenario.as_deref()).await {
                Err(e) => format!("Błąd serwisu AI: {e}"),
                Ok(raw) => match verify(&d, raw) {
                    Err(e) => e,
                    Ok(resp) => {
                        let verdict = machine::decide(&resp.report);
                        let report_hash = machine::hash_document(&resp.report);
                        set_analysis(state, id, |a| {
                            a.status = AnalysisStatus::Done;
                            a.error = None;
                            a.report = Some(resp.report.clone());
                            a.report_hash = Some(report_hash);
                            a.model = Some(resp.model.clone());
                            a.prompt_version = Some(resp.prompt_version.clone());
                            a.verdict = Some(verdict);
                        });
                        if let Err(e) = apply_action(state, id, DealAction::Resolve { verdict }) {
                            // np. termin oceny minął w trakcie analizy: raport zostaje, stan zmienia timeout
                            tracing::warn!("{id}: werdykt niezastosowany: {}", e.message);
                        }
                        state.disputes.scenarios.lock().unwrap_or_else(|p| p.into_inner()).remove(id);
                        return;
                    }
                },
            },
        };
        tracing::warn!("{id} próba {attempt}/{max}: {error}");
        let failed = attempt >= max;
        set_analysis(state, id, |a| {
            a.status = if failed { AnalysisStatus::Failed } else { AnalysisStatus::Pending };
            a.error = Some(error.clone());
        });
        if !failed {
            tokio::time::sleep(Duration::from_millis(state.cfg.ai_retry_ms * attempt as u64)).await;
        }
    }
}

/// Po restarcie: wznawia oceny, które nie skończyły się przed wyłączeniem serwera.
pub fn resume_pending(state: &AppState) {
    let pending: Vec<String> = db::doc_list::<Deal>(&state.conn(), "deal")
        .unwrap_or_default()
        .into_iter()
        .filter(|d| {
            d.status == DealStatus::Disputed && d.analysis.as_ref().is_none_or(|a| a.status == AnalysisStatus::Pending)
        })
        .map(|d| d.id)
        .collect();
    for id in pending {
        start_analysis(state, &id, None);
    }
}
