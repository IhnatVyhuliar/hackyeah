// Helpery wspólne dla aplikacji i backendu. sha256 przez @noble/hashes (działa w RN i w Node).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { QR_PREFIX_RETURN, QR_PREFIX_SHIP, type TimedStatus, type Timeouts } from './constants';
import type { DealStatus, Hex32, Listing, ListingMetadata, Minor, OracleReport, Unix, Verdict } from './types';

export const nowUnix = (): Unix => Math.floor(Date.now() / 1000);

export function sha256Hex(data: string | Uint8Array): Hex32 {
  return bytesToHex(sha256(typeof data === 'string' ? utf8ToBytes(data) : data));
}

/** JSON z kluczami posortowanymi rekurencyjnie, bez spacji (podstawa haszy dokumentów). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (value === undefined) throw new Error('canonicalJson: undefined nie jest dozwolone');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export const hashDocument = (doc: unknown): Hex32 => sha256Hex(canonicalJson(doc));

// ---------- ogłoszenie ----------

export function listingMetadata(l: Listing): ListingMetadata {
  return {
    v: 1, title: l.title, description: l.description, brand: l.brand, size: l.size, condition: l.condition,
    defects: [...l.defects], photos: l.photos.map((p) => ({ url: p.url, sha256: p.sha256 })),
    priceMinor: l.priceMinor, currency: l.currency,
  };
}

// ---------- kod QR (jednorazowy) ----------
// Sekret: 32 losowe bajty (hex). Commitment wysyłki = sha256(utf8(dealId) || secret),
// commitment zwrotu = sha256(utf8("return") || utf8(dealId) || secret).

const HEX32 = /^[0-9a-f]{64}$/;

export const newQrSecret = (): Hex32 => bytesToHex(randomBytes(32));

function secretBytes(secret: string): Uint8Array {
  if (!HEX32.test(secret)) throw new Error('Sekret QR: oczekiwano 64 znaków hex');
  return hexToBytes(secret);
}

export const shipCommitment = (dealId: string, secret: Hex32): Hex32 =>
  sha256Hex(concatBytes(utf8ToBytes(dealId), secretBytes(secret)));

export const returnCommitment = (dealId: string, secret: Hex32): Hex32 =>
  sha256Hex(concatBytes(utf8ToBytes('return'), utf8ToBytes(dealId), secretBytes(secret)));

export const qrPayload = (kind: 'ship' | 'return', dealId: string, secret: Hex32): string =>
  `${kind === 'ship' ? QR_PREFIX_SHIP : QR_PREFIX_RETURN}:${dealId}:${secret}`;

export function parseQrPayload(payload: string): { kind: 'ship' | 'return'; dealId: string; secret: Hex32 } | null {
  const m = /^(UNBOX1R?):([^:]+):([0-9a-f]{64})$/.exec(payload.trim());
  if (!m) return null;
  return { kind: m[1] === QR_PREFIX_RETURN ? 'return' : 'ship', dealId: m[2], secret: m[3] };
}

/** Nowy kod QR dla transakcji: sekret, treść do wydruku i commitment, który trafia do backendu. */
export function createQr(kind: 'ship' | 'return', dealId: string) {
  const secret = newQrSecret();
  const commitment = kind === 'ship' ? shipCommitment(dealId, secret) : returnCommitment(dealId, secret);
  return { secret, payload: qrPayload(kind, dealId, secret), commitment };
}

/**
 * Sprawdza zeskanowany QR względem transakcji: rodzaj, id transakcji i commitment.
 * Zwraca sekret do wysłania w akcji (accept/dispute/confirm-return) albo powód odrzucenia.
 */
export function verifyQr(payload: string, expected: { kind: 'ship' | 'return'; dealId: string; commitment: Hex32 | null }):
  { ok: true; secret: Hex32 } | { ok: false; reason: string } {
  const p = parseQrPayload(payload);
  if (!p) return { ok: false, reason: 'To nie jest kod QR tej aplikacji' };
  if (p.kind !== expected.kind) return { ok: false, reason: expected.kind === 'ship' ? 'To kod zwrotu, a nie wysyłki' : 'To kod wysyłki, a nie zwrotu' };
  if (p.dealId !== expected.dealId) return { ok: false, reason: 'Kod QR należy do innej transakcji' };
  const c = p.kind === 'ship' ? shipCommitment(p.dealId, p.secret) : returnCommitment(p.dealId, p.secret);
  if (!expected.commitment || c !== expected.commitment) return { ok: false, reason: 'Kod QR nie pasuje do tej przesyłki' };
  return { ok: true, secret: p.secret };
}

// ---------- werdykt (CLAUDE.md §5) ----------

/** Deterministyczny werdykt z raportu. Model AI tylko wypełnia raport; o wyniku decyduje ta funkcja. */
export function decide(r: OracleReport): Verdict {
  const b = r.buyer_recording, s = r.seller_recording;
  const buyerOk = b.continuous && b.starts_with_sealed_package && b.qr_revealed_on_opening && b.quality === 'good';
  if (!buyerOk) return 'SELLER';                                      // słabe/ucięte nagranie działa przeciw autorowi
  const sellerOk = s.quality === 'good' && s.item_clearly_visible && s.qr_card_packed;
  if (sellerOk && !r.package_matches_shipping_recording) return 'SELLER';   // paczka inna niż nadana → manipulacja
  if (!r.item_matches_listing || r.undisclosed_damage.present) return 'BUYER';
  return 'SELLER';
}

// ---------- terminy i kwoty ----------

const TIMED: readonly DealStatus[] = ['Paid', 'Shipped', 'Disputed', 'ReturnRequested', 'Returning'];
export const isTimedStatus = (s: DealStatus): s is TimedStatus => TIMED.includes(s);

export function deadlineFor(status: DealStatus, statusChangedAt: Unix, timeouts: Timeouts): Unix | null {
  return isTimedStatus(status) ? statusChangedAt + timeouts[status] : null;
}

export function formatPln(minor: Minor): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} zł`;
}

/** "120,50" / "120.5" / "120" → 12050 groszy, bez floatów. */
export function parsePln(text: string): Minor | null {
  const m = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*(zł)?\s*$/i.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}
