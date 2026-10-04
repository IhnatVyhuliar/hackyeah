// The in-app wallet (CLAUDE.md §6): generated on first launch, kept in expo-secure-store, devnet only.
import * as SecureStore from 'expo-secure-store';
import { Keypair } from '@solana/web3.js';

const KEY = 'unbox.wallet.v1';

const fromJson = (json: string) => {
  const bytes = JSON.parse(json) as unknown;
  if (!Array.isArray(bytes) || bytes.length !== 64) throw new Error('A solana-keygen file holds 64 numbers');
  return Keypair.fromSecretKey(Uint8Array.from(bytes as number[]));
};

export async function loadKeypair(): Promise<Keypair> {
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) return fromJson(stored);
  const kp = Keypair.generate();
  await SecureStore.setItemAsync(KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

/** Dev menu: a demo wallet as a solana-keygen JSON array. Takes effect after an app restart. */
export async function importWalletJson(json: string): Promise<string> {
  const kp = fromJson(json);
  await SecureStore.setItemAsync(KEY, JSON.stringify(Array.from(kp.secretKey)));
  return kp.publicKey.toBase58();
}
