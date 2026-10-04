// On-chain QR format (CLAUDE.md §4): UNBOX1[R]:<deal_base58>:<secret_base58>; 32 bytes in base58 = pubkey encoding.
import { PublicKey } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export type QrKind = 'ship' | 'return';
const PREFIX: Record<QrKind, string> = { ship: 'UNBOX1', return: 'UNBOX1R' };
const B58 = '[1-9A-HJ-NP-Za-km-z]{32,44}';
const RE = new RegExp(`^(UNBOX1R?):(${B58}):(${B58})$`);

export const shipCommitment = (deal: PublicKey, secret: Uint8Array) => sha256(concatBytes(deal.toBytes(), secret));
export const returnCommitment = (deal: PublicKey, secret: Uint8Array) => sha256(concatBytes(utf8ToBytes('return'), deal.toBytes(), secret));
export const encodeQr = (kind: QrKind, deal: PublicKey, secret: Uint8Array) =>
  `${PREFIX[kind]}:${deal.toBase58()}:${new PublicKey(secret).toBase58()}`;

export function parseQr(payload: string): { kind: QrKind; deal: PublicKey; secret: Uint8Array } | null {
  const m = RE.exec(payload.trim());
  if (!m) return null;
  try {
    const secret = new PublicKey(m[3]).toBytes();
    return { kind: m[1] === 'UNBOX1R' ? 'return' : 'ship', deal: new PublicKey(m[2]), secret };
  } catch {
    return null;
  }
}
