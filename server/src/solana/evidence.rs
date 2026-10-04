//! Fills complaint and analysis of a mirrored deal from files in /media. The chain holds only hashes;
//! a file is used only when its bytes hash to the committed value, so the server adds nothing of its own.

use crate::model::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use unbox_escrow::state::{Deal as ChainDeal, Verdict as ChainVerdict};

fn committed(dir: &Path, hash: &[u8; 32]) -> Option<Vec<u8>> {
    if *hash == [0u8; 32] {
        return None;
    }
    let bytes = std::fs::read(dir.join(hex::encode(hash))).ok()?;
    (Sha256::digest(&bytes).as_slice() == hash.as_slice()).then_some(bytes)
}

pub fn enrich(media_dir: &Path, deal: &mut Deal, chain: &ChainDeal, now: Unix) {
    if deal.complaint.is_none() {
        deal.complaint = committed(media_dir, &chain.complaint_hash).and_then(|b| serde_json::from_slice(&b).ok());
    }
    let verdict = match chain.verdict {
        ChainVerdict::None => return,
        ChainVerdict::Seller => Verdict::Seller,
        ChainVerdict::Buyer => Verdict::Buyer,
    };
    if deal.analysis.as_ref().is_some_and(|a| a.report.is_some()) {
        return;
    }
    let doc: Option<serde_json::Value> =
        committed(media_dir, &chain.report_hash).and_then(|b| serde_json::from_slice(&b).ok());
    let text = |k: &str| doc.as_ref().and_then(|v| v[k].as_str()).map(String::from);
    deal.analysis = Some(Analysis {
        status: AnalysisStatus::Done,
        attempts: 1,
        error: None,
        // Model fields are absent when the oracle decided from missing/mismatched files alone.
        report: doc.clone().and_then(|v| serde_json::from_value(v).ok()),
        report_hash: Some(hex::encode(chain.report_hash)),
        model: text("model"),
        prompt_version: text("prompt_version"),
        verdict: Some(verdict),
        updated_at: now,
    });
}
