//! SQLite (rusqlite, wbudowane SQLite). Jedno połączenie za mutexem: wszystkie zapisy są
//! serializowane, a każda operacja biznesowa wykonuje się w transakcji (BEGIN IMMEDIATE).
//! Encje (ogłoszenia, transakcje, kategorie) trzymamy jako dokumenty JSON w kształcie API.

use crate::error::ApiResult;
use crate::model::User;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS docs (
          kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,
          PRIMARY KEY (kind, id));
        CREATE TABLE IF NOT EXISTS media (
          sha256 TEXT PRIMARY KEY, mime_type TEXT NOT NULL, size INTEGER NOT NULL, uploader_id TEXT NOT NULL, at INTEGER NOT NULL);
        -- Kto wgrał dany plik (ten sam plik może wgrać kilka osób; każda może go potem użyć).
        CREATE TABLE IF NOT EXISTS media_uploads (sha256 TEXT NOT NULL, user_id TEXT NOT NULL, at INTEGER NOT NULL,
          PRIMARY KEY (sha256, user_id));
        INSERT OR IGNORE INTO media_uploads (sha256, user_id, at) SELECT sha256, uploader_id, at FROM media;
        CREATE TABLE IF NOT EXISTS ledger (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, deal_id TEXT, type TEXT NOT NULL,
          amount_minor INTEGER NOT NULL, label TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id);
        -- Jedno rozliczenie na transakcję: ochrona przed podwójną wypłatą/zwrotem także na poziomie bazy.
        CREATE UNIQUE INDEX IF NOT EXISTS ledger_settlement ON ledger (deal_id)
          WHERE type IN ('release', 'refund') AND amount_minor > 0;
        "#,
    )?;
    Ok(conn)
}

/// Wykonuje `f` w transakcji SQLite (wszystko albo nic).
pub fn tx<T>(conn: &mut Connection, f: impl FnOnce(&Connection) -> ApiResult<T>) -> ApiResult<T> {
    let t = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let out = f(&t)?;
    t.commit()?;
    Ok(out)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

// ---------- dokumenty ----------

pub fn doc_get<T: DeserializeOwned>(c: &Connection, kind: &str, id: &str) -> ApiResult<Option<T>> {
    let raw: Option<String> =
        c.query_row("SELECT data FROM docs WHERE kind = ?1 AND id = ?2", params![kind, id], |r| r.get(0)).optional()?;
    Ok(raw.map(|s| serde_json::from_str(&s).expect("dokument w bazie zgodny z typem")))
}

pub fn doc_put<T: Serialize>(c: &Connection, kind: &str, id: &str, value: &T) -> ApiResult<()> {
    c.execute(
        "INSERT INTO docs (kind, id, data, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        params![kind, id, serde_json::to_string(value).expect("serializacja dokumentu"), now_ms()],
    )?;
    Ok(())
}

pub fn doc_list<T: DeserializeOwned>(c: &Connection, kind: &str) -> ApiResult<Vec<T>> {
    let mut st = c.prepare("SELECT data FROM docs WHERE kind = ?1 ORDER BY rowid")?;
    let rows = st.query_map(params![kind], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(serde_json::from_str(&r?).expect("dokument w bazie zgodny z typem"));
    }
    Ok(out)
}

// ---------- użytkownicy ----------

pub fn user_by_id(c: &Connection, id: &str) -> ApiResult<Option<User>> {
    let raw: Option<String> =
        c.query_row("SELECT data FROM users WHERE id = ?1", params![id], |r| r.get(0)).optional()?;
    Ok(raw.map(|s| serde_json::from_str(&s).expect("użytkownik w bazie")))
}

pub fn user_by_email(c: &Connection, email: &str) -> ApiResult<Option<(User, String)>> {
    let row: Option<(String, String)> = c
        .query_row("SELECT data, password_hash FROM users WHERE email = ?1", params![email.to_lowercase()], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .optional()?;
    Ok(row.map(|(d, h)| (serde_json::from_str(&d).expect("użytkownik w bazie"), h)))
}

pub fn user_insert(c: &Connection, u: &User, password_hash: &str) -> ApiResult<()> {
    c.execute(
        "INSERT INTO users (id, email, password_hash, data) VALUES (?1, ?2, ?3, ?4)",
        params![u.id, u.email.to_lowercase(), password_hash, serde_json::to_string(u).expect("serializacja")],
    )?;
    Ok(())
}

// ---------- media ----------

pub struct MediaRow {
    pub mime_type: String,
    pub size: u64,
}

pub fn media_get(c: &Connection, sha: &str) -> ApiResult<Option<MediaRow>> {
    Ok(c.query_row("SELECT mime_type, size FROM media WHERE sha256 = ?1", params![sha], |r| {
        Ok(MediaRow { mime_type: r.get(0)?, size: r.get::<_, i64>(1)? as u64 })
    })
    .optional()?)
}

pub fn media_insert(c: &Connection, sha: &str, mime: &str, size: u64, uploader: &str) -> ApiResult<()> {
    let at = now_ms();
    c.execute(
        "INSERT OR IGNORE INTO media (sha256, mime_type, size, uploader_id, at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![sha, mime, size as i64, uploader, at],
    )?;
    c.execute(
        "INSERT OR IGNORE INTO media_uploads (sha256, user_id, at) VALUES (?1, ?2, ?3)",
        params![sha, uploader, at],
    )?;
    Ok(())
}

/// Plik istnieje, ma typ z prefiksem `kind` ("image/" albo "video/") i ten użytkownik go wgrał.
pub fn media_owned_by(c: &Connection, sha: &str, user: &str, kind: &str) -> ApiResult<bool> {
    let mime: Option<String> = c
        .query_row(
            "SELECT m.mime_type FROM media m JOIN media_uploads u ON u.sha256 = m.sha256
             WHERE m.sha256 = ?1 AND u.user_id = ?2",
            params![sha, user],
            |r| r.get(0),
        )
        .optional()?;
    Ok(mime.is_some_and(|m| m.starts_with(kind)))
}

pub fn db_ok(c: &Connection) -> bool {
    c.query_row("SELECT 1", [], |r| r.get::<_, i64>(0)).is_ok()
}

pub fn reset(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        "DELETE FROM users; DELETE FROM docs; DELETE FROM media; DELETE FROM media_uploads; DELETE FROM ledger;",
    )
}
