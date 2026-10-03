// SQLite (node:sqlite). Stan runtime w server/data/unbox.db; dane startowe z seed.ts (oddzielnie).
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config, paths } from './config';
import type { Category, Deal, Listing, User } from '@unbox/shared';

for (const d of [config.dataDir, paths.media, paths.tmp]) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(paths.db);
db.exec(`
  PRAGMA journal_mode = WAL;
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
  CREATE UNIQUE INDEX IF NOT EXISTS ledger_settlement ON ledger (deal_id) WHERE type IN ('release', 'refund') AND amount_minor > 0;
`);

type Kinds = { listing: Listing; deal: Deal; category: Category };

export const docs = {
  get<K extends keyof Kinds>(kind: K, id: string): Kinds[K] | null {
    const row = db.prepare('SELECT data FROM docs WHERE kind = ? AND id = ?').get(kind, id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Kinds[K]) : null;
  },
  put<K extends keyof Kinds>(kind: K, id: string, value: Kinds[K]): Kinds[K] {
    db.prepare(`INSERT INTO docs (kind, id, data, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
      .run(kind, id, JSON.stringify(value), Date.now());
    return value;
  },
  list<K extends keyof Kinds>(kind: K): Kinds[K][] {
    return (db.prepare('SELECT data FROM docs WHERE kind = ? ORDER BY rowid').all(kind) as { data: string }[])
      .map((r) => JSON.parse(r.data) as Kinds[K]);
  },
};

export const users = {
  byId(id: string): User | null {
    const row = db.prepare('SELECT data FROM users WHERE id = ?').get(id) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as User) : null;
  },
  byEmail(email: string): { user: User; passwordHash: string } | null {
    const row = db.prepare('SELECT data, password_hash FROM users WHERE email = ?').get(email.toLowerCase()) as
      { data: string; password_hash: string } | undefined;
    return row ? { user: JSON.parse(row.data) as User, passwordHash: row.password_hash } : null;
  },
  insert(user: User, passwordHash: string) {
    db.prepare('INSERT INTO users (id, email, password_hash, data) VALUES (?, ?, ?, ?)')
      .run(user.id, user.email.toLowerCase(), passwordHash, JSON.stringify(user));
  },
};

export const media = {
  get(sha256: string): { mimeType: string; size: number; uploaderId: string } | null {
    const r = db.prepare('SELECT mime_type, size, uploader_id FROM media WHERE sha256 = ?').get(sha256) as
      { mime_type: string; size: number; uploader_id: string } | undefined;
    return r ? { mimeType: r.mime_type, size: r.size, uploaderId: r.uploader_id } : null;
  },
  insert(sha256: string, mimeType: string, size: number, uploaderId: string) {
    db.prepare('INSERT OR IGNORE INTO media (sha256, mime_type, size, uploader_id, at) VALUES (?, ?, ?, ?, ?)')
      .run(sha256, mimeType, size, uploaderId, Date.now());
    db.prepare('INSERT OR IGNORE INTO media_uploads (sha256, user_id, at) VALUES (?, ?, ?)').run(sha256, uploaderId, Date.now());
  },
  /** Plik istnieje, ma typ z prefiksem `kind` i ten użytkownik go wgrał. */
  ownedBy(sha256: string, userId: string, kind: 'image/' | 'video/'): boolean {
    const r = db.prepare(`SELECT m.mime_type FROM media m JOIN media_uploads u ON u.sha256 = m.sha256
                          WHERE m.sha256 = ? AND u.user_id = ?`).get(sha256, userId) as { mime_type: string } | undefined;
    return !!r && r.mime_type.startsWith(kind);
  },
};

/** Szybki test bazy dla /api/health. */
export function dbOk(): boolean {
  try { db.prepare('SELECT 1').get(); return true; } catch { return false; }
}

/** Wykonuje fn w transakcji SQLite (wszystko albo nic). */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function resetDb() {
  db.exec('DELETE FROM users; DELETE FROM docs; DELETE FROM media; DELETE FROM media_uploads; DELETE FROM ledger;');
}
