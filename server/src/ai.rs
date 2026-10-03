//! Adaptery AI. Serwis AI tylko mierzy (raport); werdykt liczy backend przez `decide()`.

use crate::config::{AiMode, Config};
use crate::model::*;
use serde_json::{json, Value};
use std::time::Duration;

pub const MOCK_SCENARIOS: &[&str] =
    &["ok", "defect", "swap", "invalid_recording", "not_as_described", "invalid_report", "wrong_evidence", "ai_down"];

pub enum Ai {
    Mock { delay_ms: u64 },
    Http { client: reqwest::Client, url: String },
}

impl Ai {
    pub fn from_config(cfg: &Config) -> Self {
        match cfg.ai {
            AiMode::Mock => Ai::Mock { delay_ms: cfg.mock_ai_delay_ms },
            AiMode::Http => Ai::Http {
                client: reqwest::Client::builder()
                    .timeout(Duration::from_millis(cfg.ai_timeout_ms))
                    .build()
                    .expect("klient HTTP"),
                url: cfg.ai_url.clone(),
            },
        }
    }

    /// Surowa odpowiedź wyroczni (backend sam ją waliduje). `Err` = awaria/niedostępność.
    pub async fn analyze(&self, req: &OracleRequest, scenario: Option<&str>) -> Result<Value, String> {
        match self {
            Ai::Mock { delay_ms } => {
                tokio::time::sleep(Duration::from_millis(*delay_ms)).await;
                mock_response(req, scenario.unwrap_or("ok"))
            }
            Ai::Http { client, url } => {
                let res = client.post(format!("{url}/v1/disputes/analyze")).json(req).send().await.map_err(|e| {
                    if e.is_timeout() {
                        "przekroczony czas odpowiedzi".to_string()
                    } else {
                        e.to_string()
                    }
                })?;
                let status = res.status();
                if !status.is_success() {
                    let body = res.text().await.unwrap_or_default();
                    return Err(format!("HTTP {} {}", status.as_u16(), body.chars().take(300).collect::<String>()));
                }
                res.json::<Value>().await.map_err(|e| format!("niepoprawny JSON: {e}"))
            }
        }
    }

    /// Lekki test dostępności (używany w tle przez /api/health).
    pub async fn health(&self) -> String {
        match self {
            Ai::Mock { .. } => "mock".into(),
            Ai::Http { client, url } => {
                match client.get(format!("{url}/health")).timeout(Duration::from_secs(3)).send().await {
                    Ok(r) if r.status().is_success() => "http".into(),
                    Ok(r) => format!("http (HTTP {})", r.status().as_u16()),
                    Err(_) => "http (niedostępny)".into(),
                }
            }
        }
    }
}

fn good_report() -> OracleReport {
    OracleReport {
        buyer_recording: BuyerRecording {
            continuous: true,
            starts_with_sealed_package: true,
            qr_revealed_on_opening: true,
            quality: Quality::Good,
            notes: "Nagranie ciągłe od zamkniętej paczki, QR widoczny po otwarciu.".into(),
        },
        seller_recording: SellerRecording {
            item_clearly_visible: true,
            qr_card_packed: true,
            package_sealed_and_labeled: true,
            quality: Quality::Good,
            notes: "Przedmiot dobrze widoczny, karta QR włożona, paczka zaklejona i oznaczona.".into(),
        },
        package_matches_shipping_recording: true,
        item_matches_listing: true,
        undisclosed_damage: UndisclosedDamage { present: false, description: String::new(), timestamps: vec![] },
        reasoning: "Przedmiot zgodny z ogłoszeniem, brak nieujawnionych wad.".into(),
    }
}

fn mock_response(req: &OracleRequest, scenario: &str) -> Result<Value, String> {
    let evidence = OracleEvidence {
        packing_video_sha256: req.packing_video.sha256.clone(),
        unboxing_video_sha256: req.unboxing_video.sha256.clone(),
    };
    let mut r = good_report();
    match scenario {
        "ai_down" => return Err("Serwis AI niedostępny (scenariusz testowy)".into()),
        "invalid_report" => {
            return Ok(
                json!({ "report": { "reasoning": "brak pól" }, "model": "mock", "prompt_version": "v1", "evidence": evidence }),
            )
        }
        "ok" => {}
        "defect" | "wrong_evidence" => {
            r.undisclosed_damage = UndisclosedDamage {
                present: true,
                description: "Plama na lewym rękawie, nieujawniona w ogłoszeniu.".into(),
                timestamps: vec!["0:14".into()],
            };
            r.reasoning = "Na nagraniu otwarcia widać plamę na rękawie, której nie ma na liście wad.".into();
        }
        "not_as_described" => {
            r.item_matches_listing = false;
            r.reasoning = "Rozmiar na metce (L) nie zgadza się z ogłoszeniem (M).".into();
        }
        "swap" => {
            r.package_matches_shipping_recording = false;
            r.item_matches_listing = false;
            r.reasoning = "Paczka na nagraniu otwarcia ma inną taśmę i etykietę niż nadana przez sprzedającego.".into();
        }
        "invalid_recording" => {
            r.buyer_recording.continuous = false;
            r.buyer_recording.quality = Quality::Poor;
            r.buyer_recording.notes = "Cięcie w 0:07, paczka poza kadrem.".into();
            r.undisclosed_damage = UndisclosedDamage {
                present: true,
                description: "Możliwa plama".into(),
                timestamps: vec!["0:20".into()],
            };
            r.reasoning = "Nagranie otwarcia nieciągłe, więc nie dowodzi stanu przy otwarciu.".into();
        }
        other => return Err(format!("nieznany scenariusz {other}")),
    }
    let mut ev = serde_json::to_value(&evidence).expect("evidence");
    if scenario == "wrong_evidence" {
        ev["unboxing_video_sha256"] = json!("f".repeat(64));
    }
    Ok(json!({ "report": r, "model": "mock", "prompt_version": "v1", "evidence": ev }))
}
