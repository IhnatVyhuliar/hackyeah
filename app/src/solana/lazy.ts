// Defers the wallet and RPC setup to the first call, so a missing app/.env never fails at import time.
// No React Native imports: tested in Node.
import type { Escrow } from '@unbox/shared';
import { toEscrowError } from './errors';

const METHODS = ['walletAddress', 'networkNow', 'requestTestSol', 'createListing', 'cancelListing', 'purchase', 'newQrCard',
  'markShipped', 'acceptDelivery', 'openDispute', 'markReturned', 'confirmReturn', 'settleExpired'] as const;

export function lazyEscrow(init: () => Promise<Escrow>): Escrow {
  let ready: Promise<Escrow> | null = null;
  const core = () => (ready ??= init().catch((e) => {
    ready = null;   // a failed SecureStore read or bad config is retried on the next call
    throw toEscrowError(e);
  }));
  const api: Record<string, unknown> = { mode: 'solana' };
  for (const m of METHODS) {
    api[m] = async (...a: unknown[]) => ((await core())[m] as (...x: unknown[]) => Promise<unknown>)(...a);
  }
  return api as unknown as Escrow;
}
