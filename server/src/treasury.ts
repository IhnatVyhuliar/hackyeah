// Zasilanie portfeli demo ze skarbca (tylko CHAIN=devnet): 1 SOL, gdy saldo < 0.5 SOL, raz na portfel.
// To są własne środki zespołu na opłaty sieci, nie środki użytkowników.
import { LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction } from '@solana/web3.js';
import { devnetConnection } from './chain/devnetChain';
import { config } from './config';
import { db } from './db';

export async function dripIfNeeded(wallet: string): Promise<string | null> {
  if (config.chain !== 'devnet' || !config.treasury) return null;
  if (db.prepare('SELECT 1 FROM treasury_drips WHERE wallet = ?').get(wallet)) return null;
  const to = new PublicKey(wallet);
  const balance = await devnetConnection.getBalance(to, 'confirmed');
  if (balance >= 0.5 * LAMPORTS_PER_SOL) return null;
  const tx = new Transaction().add(SystemProgram.transfer({
    fromPubkey: config.treasury.publicKey, toPubkey: to, lamports: LAMPORTS_PER_SOL,
  }));
  const sig = await sendAndConfirmTransaction(devnetConnection, tx, [config.treasury], { commitment: 'confirmed' });
  db.prepare('INSERT INTO treasury_drips (wallet, signature, at) VALUES (?, ?, ?)').run(wallet, sig, Date.now());
  console.log(`[treasury] 1 SOL → ${wallet} (${sig})`);
  return sig;
}
