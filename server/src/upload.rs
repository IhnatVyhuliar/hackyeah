//! Strumieniowy odbiór multipart: zapis do pliku tymczasowego z liczeniem sha256 w locie.
//! Nazwa pliku od klienta jest ignorowana; plik docelowy nazywa się swoim haszem i nigdy nie jest nadpisywany.

use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use axum::extract::{FromRequest, Multipart, Request};
use axum::http::header;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

pub struct SavedUpload {
    pub tmp_path: PathBuf,
    pub sha256: String,
    pub size: u64,
    pub mime_type: String,
}

fn bad_multipart(detail: impl std::fmt::Display) -> ApiError {
    ApiError::validation(format!("Niepoprawne żądanie multipart: {detail}"))
}

pub async fn receive(state: &AppState, req: Request, field_name: &str) -> ApiResult<SavedUpload> {
    let max = state.cfg.max_upload_bytes;
    let limit_mb = (max as f64 / 1024.0 / 1024.0).round();
    let too_large = || ApiError::too_large(format!("Plik większy niż {limit_mb} MB"));
    let ct = req.headers().get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).unwrap_or("");
    if !ct.starts_with("multipart/form-data") {
        return Err(ApiError::validation("Oczekiwano multipart/form-data"));
    }
    let declared = req
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    if declared > max + 1024 * 1024 {
        return Err(too_large());
    }
    let mut mp = Multipart::from_request(req, &()).await.map_err(bad_multipart)?;

    tokio::fs::create_dir_all(state.cfg.tmp_dir()).await.map_err(|e| ApiError::internal(e.to_string()))?;
    let mut saved: Option<SavedUpload> = None;
    let mut over_limit = false;
    loop {
        let field = match mp.next_field().await {
            Ok(Some(f)) => f,
            Ok(None) => break,
            Err(e) => {
                cleanup(&saved).await;
                return Err(bad_multipart(e));
            }
        };
        let mut field = field;
        let wanted = field.name() == Some(field_name) && saved.is_none() && !over_limit;
        if !wanted {
            // pozostałe pola i pliki: odczytujemy i odrzucamy
            loop {
                match field.chunk().await {
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(e) => {
                        cleanup(&saved).await;
                        return Err(bad_multipart(e));
                    }
                }
            }
            continue;
        }
        let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
        let tmp = state.cfg.tmp_dir().join(uuid::Uuid::new_v4().to_string());
        let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| ApiError::internal(e.to_string()))?;
        let mut hasher = Sha256::new();
        let mut size: u64 = 0;
        loop {
            match field.chunk().await {
                Ok(Some(chunk)) => {
                    size += chunk.len() as u64;
                    if size > max {
                        over_limit = true;
                        continue; // dociągamy resztę bez zapisu, żeby wysłać czytelną odpowiedź 413
                    }
                    hasher.update(&chunk);
                    if let Err(e) = file.write_all(&chunk).await {
                        let _ = tokio::fs::remove_file(&tmp).await;
                        return Err(ApiError::internal(e.to_string()));
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    drop(file);
                    let _ = tokio::fs::remove_file(&tmp).await;
                    return Err(bad_multipart(e));
                }
            }
        }
        file.flush().await.map_err(|e| ApiError::internal(e.to_string()))?;
        drop(file);
        if over_limit {
            let _ = tokio::fs::remove_file(&tmp).await;
            continue;
        }
        saved = Some(SavedUpload { tmp_path: tmp, sha256: hex::encode(hasher.finalize()), size, mime_type: mime });
    }
    if over_limit {
        cleanup(&saved).await;
        return Err(too_large());
    }
    let Some(s) = saved else {
        return Err(ApiError::validation(format!("Brak pliku w polu \"{field_name}\"")));
    };
    if s.size == 0 {
        let _ = tokio::fs::remove_file(&s.tmp_path).await;
        return Err(ApiError::validation("Pusty plik"));
    }
    Ok(s)
}

async fn cleanup(saved: &Option<SavedUpload>) {
    if let Some(s) = saved {
        let _ = tokio::fs::remove_file(&s.tmp_path).await;
    }
}

/// Przenosi plik do katalogu docelowego pod nazwą z haszem. Istniejący plik o tym haszu ma z definicji
/// tę samą treść, więc nigdy go nie nadpisujemy (usuwamy tylko plik tymczasowy).
pub async fn commit(u: &SavedUpload, dir: &Path) -> ApiResult<PathBuf> {
    tokio::fs::create_dir_all(dir).await.map_err(|e| ApiError::internal(e.to_string()))?;
    let dest = dir.join(&u.sha256);
    if tokio::fs::try_exists(&dest).await.unwrap_or(false) {
        let _ = tokio::fs::remove_file(&u.tmp_path).await;
    } else {
        tokio::fs::rename(&u.tmp_path, &dest).await.map_err(|e| ApiError::internal(e.to_string()))?;
    }
    Ok(dest)
}
