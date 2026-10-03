// Helpery z KONTRAKT §6. sha256 przez @noble/hashes (działa w RN i w Node).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { PublicKey } from '@solana/web3.js';
import { SEAL_PREFIX } from './constants';
import type {
  Base58, ChainStatus, Cluster, EscrowState, Hex32, Measurements, OrderStatus, OutcomeReason,
  Thresholds, Unix, Verification, Windows,
} from './types';

export const nowUnix = (): Unix => Math.floor(Date.now() / 1000);

export function sha256Hex(data: string | Uint8Array): Hex32 {
  return bytesToHex(sha256(typeof data === 'string' ? utf8ToBytes(data) : data));
}

// ---------- order_id / PDA ----------

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Niepoprawny UUID: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToUuid(bytes: Uint8Array | number[]): string {
  const h = bytesToHex(Uint8Array.from(bytes));
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const toPk = (p: PublicKey | Base58) => (typeof p === 'string' ? new PublicKey(p) : p);

export function escrowPda(orderId: string, programId: PublicKey | Base58): Base58 {
  return PublicKey.findProgramAddressSync(
    [utf8ToBytes('escrow'), uuidToBytes(orderId)], toPk(programId))[0].toBase58();
}

export function configPda(programId: PublicKey | Base58): Base58 {
  return PublicKey.findProgramAddressSync([utf8ToBytes('config')], toPk(programId))[0].toBase58();
}

// ---------- plomba ----------

export const sealPayload = (orderId: string, nonce: string): string => `${SEAL_PREFIX}|${orderId}|${nonce}`;

export const sealHash = (payload: string): Hex32 => sha256Hex(payload);

export function shortCode(nonce: string): string {
  const n = nonce.toUpperCase();
  return `SS-${n.slice(0, 4)}-${n.slice(4, 6)}`;
}

/** Parsuje treść QR plomby; null, jeśli to nie plomba SellSol. */
export function parseSealPayload(payload: string): { orderId: string; nonce: string } | null {
  const m = /^SELLSOL1\|([0-9a-f-]{36})\|([0-9a-f]{32})$/.exec(payload.trim());
  return m ? { orderId: m[1], nonce: m[2] } : null;
}

// ---------- warunki ----------

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

export interface Terms {
  listingId: string; priceLamports: string; sellerWallet: Base58;
  thresholds: Thresholds; windows: Windows; extraTests: string[]; declaredWeightG: number;
}

export const termsHash = (terms: Terms): Hex32 => sha256Hex(canonicalJson(terms));

// ---------- Explorer ----------

const clusterParam = (c: Cluster) => (c === 'devnet' ? '?cluster=devnet'
  : c === 'localnet' ? '?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899' : '?cluster=devnet');

export const explorerTxUrl = (sig: string, cluster: Cluster = 'devnet') =>
  `https://explorer.solana.com/tx/${sig}${clusterParam(cluster)}`;
export const explorerAddressUrl = (addr: Base58, cluster: Cluster = 'devnet') =>
  `https://explorer.solana.com/address/${addr}${clusterParam(cluster)}`;

// ---------- tabela decyzji (kopia §3; o pieniądzach decyduje program) ----------

export interface Outcome { released: boolean; reason: OutcomeReason; chargeFee: boolean }

export function evaluateVerdict(m: Measurements, t: Thresholds): Outcome {
  const transitOk = m.qrMatch && m.sealIntact && m.packageScore >= t.minPackageScore && m.weightDiffG <= t.weightTolG;
  const itemOk = m.matchScore >= t.minMatchScore && !m.defectFound && m.testsPassed;
  if (!m.recordingValid) return { released: true, reason: 'RecordingInvalid', chargeFee: true };
  if (!transitOk) return { released: false, reason: 'TransitBroken', chargeFee: true };
  if (!itemOk) return { released: false, reason: 'ItemMismatch', chargeFee: true };
  return { released: true, reason: 'VerifiedOk', chargeFee: true };
}

/** Wynik `claim_timeout` dla stanu escrow w chwili `now`; null, gdy termin nie minął. */
export function timeoutOutcome(e: Pick<EscrowState, 'status' | 'shipDeadline' | 'openDeadline' | 'verdictDeadline'>,
                               now: Unix): Outcome | null {
  if (e.status === 'Funded' && now > e.shipDeadline) return { released: false, reason: 'ShipTimeout', chargeFee: false };
  if (e.status === 'Shipped' && e.openDeadline != null && now > e.openDeadline)
    return { released: true, reason: 'OpenTimeout', chargeFee: true };
  if (e.status === 'Verifying' && e.verdictDeadline != null && now > e.verdictDeadline)
    return { released: false, reason: 'VerifierTimeout', chargeFee: true };
  return null;
}

/** §5.3: fee = amount * fee_bps / 10_000 w dół. */
export function splitPayout(amountLamports: string, feeBps: number, chargeFee: boolean) {
  const amount = BigInt(amountLamports);
  const fee = chargeFee ? (amount * BigInt(feeBps)) / 10_000n : 0n;
  return { payout: (amount - fee).toString(), fee: fee.toString() };
}

// ---------- status API (§4.2) ----------

export interface OffchainState {
  packingVerification: Verification['status'] | null;   // ostatnia weryfikacja pakowania
  hasReadyForPickup: boolean;
  unboxingVerification: Verification['status'] | null;  // ostatnia weryfikacja otwarcia
}

export function deriveStatus(chain: ChainStatus, off: OffchainState): OrderStatus {
  switch (chain) {
    case 'none': return 'awaiting_payment';
    case 'Released': return 'released';
    case 'Refunded': return 'refunded';
    case 'Verifying': return 'verifying';
    case 'Funded':
      if (!off.packingVerification) return 'funded';
      // Raport pakowania jest doradczy: także "failed" pozwala zatwierdzić nadanie.
      return off.packingVerification === 'processing' ? 'packing_review' : 'ready_to_ship';
    case 'Shipped':
      if (off.unboxingVerification) return 'unboxing_review';
      return off.hasReadyForPickup ? 'delivered' : 'shipped';
  }
}
