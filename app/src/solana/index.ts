// SolanaEscrow for the app: the in-app wallet signs unbox_escrow instructions (person B).
import { fetch } from 'expo/fetch';
import { Connection, PublicKey } from '@solana/web3.js';
import type { Idl } from '@anchor-lang/core';
import { EscrowError, type Escrow } from '@unbox/shared';
import idl from '../../../packages/shared/idl/unbox_escrow.json';
import { createEscrowCore } from './escrow';
import { lazyEscrow } from './lazy';
import { loadKeypair } from './wallet';

export { importWalletJson } from './wallet';

const FETCH_TIMEOUT_MS = 15_000;

// expo/fetch, because React Native's built-in fetch may lack arrayBuffer().
async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: abort.signal });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function trustedArbiter(): PublicKey {
  const key = process.env.EXPO_PUBLIC_ORACLE_PUBKEY;
  try {
    if (key) return new PublicKey(key);
  } catch {}
  throw new EscrowError('Rejected', 'Aplikacja nie zna adresu weryfikatora (EXPO_PUBLIC_ORACLE_PUBKEY w app/.env). Płatności są wyłączone.');
}

export function createSolanaEscrow(): Escrow {
  return lazyEscrow(async () => createEscrowCore({
    connection: new Connection(process.env.EXPO_PUBLIC_RPC_URL || 'https://api.devnet.solana.com', 'confirmed'),
    keypair: await loadKeypair(),
    idl: idl as Idl,
    trustedArbiter: trustedArbiter(),
    fetchBytes,
  }));
}
