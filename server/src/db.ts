// SQLite (node:sqlite). Encje trzymamy jako dokumenty JSON w kształcie z KONTRAKT §7.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config, paths } from './config';
import type { Category, Listing, Order, User, Verification } from '@sellsol/shared';

for (const d of [config.dataDir, paths.media, paths.files, paths.tmp]) fs.mkdirSync(d, { recursive: true });

export const db = new DatabaseSync(paths.db);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS docs (
    kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, id));
  CREATE TABLE IF NOT EXISTS used_seals (order_id TEXT PRIMARY KEY, used_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS treasury_drips (wallet TEXT PRIMARY KEY, signature TEXT NOT NULL, at INTEGER NOT NULL);
`);

type Kinds = { listing: Listing; order: Order; verification: Verification; category: Category; mock_escrow: unknown };

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
  delete(kind: keyof Kinds, id: string) {
    db.prepare('DELETE FROM docs WHERE kind = ? AND id = ?').run(kind, id);
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
  update(user: User) {
    db.prepare('UPDATE users SET data = ? WHERE id = ?').run(JSON.stringify(user), user.id);
  },
};

export const seals = {
  isUsed: (orderId: string) => !!db.prepare('SELECT 1 FROM used_seals WHERE order_id = ?').get(orderId),
  markUsed: (orderId: string) =>
    db.prepare('INSERT OR IGNORE INTO used_seals (order_id, used_at) VALUES (?, ?)').run(orderId, Date.now()),
};

export function resetDb() {
  db.exec('DELETE FROM users; DELETE FROM docs; DELETE FROM used_seals;');
}
