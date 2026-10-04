// The seam between the app and "the contract". Two implementations:
//   DemoEscrow  (app/src/escrow/demo.ts, person A): PAYMENTS=demo REST actions, offline fallback.
//   SolanaEscrow (app/src/solana/, person B): signs unbox_escrow instructions with the in-app wallet.
// Frozen: change only with both people agreeing, in a separate commit.
import type { ComplaintCategory, Hex32, Unix } from './types';

/** `id` = server listing/deal id; `deal` = Deal PDA (base58) from `onchain.deal`, null in demo mode. */
export interface DealKey { id: string; deal: string | null }

/** Exactly the JSON of POST /api/listings/{id}/publish (PAYMENTS=solana). */
export interface PublishArgs {
  listingId: string; deal: string; dealId: number; priceLamports: number;
  listingHash: Hex32; metadataUri: string; arbiter: string; programId: string;
}

export interface TxResult { signature: string | null; explorerUrl: string | null }

/** `payload` goes on the printed card (opaque to the UI); `commitment` goes to markShipped/markReturned. */
export interface QrCard { kind: 'ship' | 'return'; payload: string; commitment: Hex32 }

export interface ComplaintInput { category: ComplaintCategory; description: string }

export type EscrowErrorCode =
  | 'InvalidStatus' | 'Unauthorized' | 'DeadlinePassed' | 'DeadlineNotReached'
  | 'ListingMismatch' | 'ArbiterMismatch' | 'QrMismatch' | 'InsufficientFunds' | 'Network' | 'Rejected';

/** `message` is Polish and ready for the UI. */
export class EscrowError extends Error {
  constructor(readonly code: EscrowErrorCode, message: string) {
    super(message);
    this.name = 'EscrowError';
  }
}

export const isEscrowError = (e: unknown): e is EscrowError =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'EscrowError' && typeof (e as { code?: unknown }).code === 'string';

export interface Escrow {
  readonly mode: 'solana' | 'demo';
  /** Wallet address (base58); null in demo mode. */
  walletAddress(): Promise<string | null>;
  /** Unix seconds by the network clock (Clock sysvar); demo: the phone clock. */
  networkNow(): Promise<Unix>;
  requestTestSol(): Promise<TxResult>;
  /** Seller signs create_listing with the server's publish args; demo: no-op. */
  createListing(a: PublishArgs): Promise<TxResult>;
  cancelListing(k: DealKey): Promise<TxResult>;
  /** solana: checks sha256(metadata.json) and the trusted arbiter BEFORE signing. */
  purchase(k: DealKey): Promise<TxResult>;
  newQrCard(kind: 'ship' | 'return', k: DealKey): Promise<QrCard>;
  markShipped(k: DealKey, i: { qrCommitment: Hex32; packingVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  acceptDelivery(k: DealKey, qrPayload: string): Promise<TxResult>;
  openDispute(k: DealKey, i: { qrPayload: string; unboxingVideoSha256: Hex32; complaint: ComplaintInput; complaintSha256: Hex32 }): Promise<TxResult>;
  markReturned(k: DealKey, i: { returnQrCommitment: Hex32; returnVideoSha256: Hex32; trackingNumber: string }): Promise<TxResult>;
  confirmReturn(k: DealKey, returnQrPayload: string): Promise<TxResult>;
  settleExpired(k: DealKey): Promise<TxResult>;
}
