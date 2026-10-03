// CHAIN=devnet: transakcje przez @sellsol/sdk (Osoba 2, sygnatury z KONTRAKT §5.6).
// Serwer tylko buduje niepodpisane transakcje, czyta konto escrow i wysyła pomiary kluczem weryfikatora.
import { Connection, Keypair, PublicKey, type Transaction } from '@solana/web3.js';
import type { EscrowState, Measurements, Order, PreparedTx, Thresholds, TxAction, Windows } from '@sellsol/shared';
import { config } from '../config';
import { ApiErr } from '../errors';
import type { ChainAdapter, PrepareExtra } from './types';

interface SellSolSdk {
  buildFundEscrowTx(p: { orderId: string; buyer: PublicKey; seller: PublicKey; amountLamports: string;
    termsHash: string; thresholds: Thresholds; windows: Windows }): Promise<Transaction>;
  buildSellerDeclineTx(p: { orderId: string; seller: PublicKey }): Promise<Transaction>;
  buildCommitShipmentTx(p: { orderId: string; seller: PublicKey; expectedAmountLamports: string;
    expectedTermsHash: string; sealHash: string; packingVideoHash: string }): Promise<Transaction>;
  buildConfirmReceiptTx(p: { orderId: string; buyer: PublicKey }): Promise<Transaction>;
  buildOpenClaimTx(p: { orderId: string; buyer: PublicKey; unboxingVideoHash: string }): Promise<Transaction>;
  buildClaimTimeoutTx(p: { orderId: string; cranker: PublicKey }): Promise<Transaction>;
  submitVerdict(p: { orderId: string; verifier: Keypair; measurements: Measurements }): Promise<string>;
  claimTimeout(p: { orderId: string; cranker: Keypair }): Promise<string>;
  getEscrow(orderId: string): Promise<EscrowState | null>;
}
interface SdkModule {
  SellSolSdk: new (o: { connection: Connection; programId?: PublicKey }) => SellSolSdk;
  serializeUnsigned(tx: Transaction): string;
}

const connection = new Connection(config.rpcUrl, 'confirmed');
const programId = new PublicKey(config.programId);
let sdkPromise: Promise<{ sdk: SellSolSdk; mod: SdkModule }> | null = null;

function loadSdk() {
  const name = '@sellsol/sdk';   // import dynamiczny: serwer w trybie mock nie wymaga SDK
  sdkPromise ??= (import(name) as Promise<SdkModule>).then((mod) => ({
    mod, sdk: new mod.SellSolSdk({ connection, programId }),
  })).catch((e) => { sdkPromise = null; throw new ApiErr('CHAIN_ERROR', `Brak @sellsol/sdk: ${e.message}`); });
  return sdkPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireKey(k: Keypair | null, name: string): Keypair {
  if (!k) throw new ApiErr('CHAIN_ERROR', `Brak ${name} w env`);
  return k;
}

export const devnetChain: ChainAdapter = {
  kind: 'devnet',
  programId: config.programId,
  cluster: 'devnet',

  async prepare(order: Order, action: TxAction, wallet: string, extra?: PrepareExtra): Promise<PreparedTx> {
    const { sdk, mod } = await loadSdk();
    const w = new PublicKey(wallet);
    const orderId = order.id;
    let tx: Transaction;
    switch (action) {
      case 'fund':
        tx = await sdk.buildFundEscrowTx({ orderId, buyer: w, seller: new PublicKey(order.sellerWallet),
          amountLamports: order.amountLamports, termsHash: order.termsHash,
          thresholds: order.thresholds, windows: order.windows });
        break;
      case 'seller_decline': tx = await sdk.buildSellerDeclineTx({ orderId, seller: w }); break;
      case 'commit_shipment':
        tx = await sdk.buildCommitShipmentTx({ orderId, seller: w, expectedAmountLamports: order.amountLamports,
          expectedTermsHash: order.termsHash, sealHash: order.seal!.sealHash, packingVideoHash: order.packingVideoHash! });
        break;
      case 'confirm_receipt': tx = await sdk.buildConfirmReceiptTx({ orderId, buyer: w }); break;
      case 'open_claim':
        tx = await sdk.buildOpenClaimTx({ orderId, buyer: w, unboxingVideoHash: extra!.unboxingVideoHash! });
        break;
      case 'claim_timeout': tx = await sdk.buildClaimTimeoutTx({ orderId, cranker: w }); break;
      case 'submit_verdict': throw new ApiErr('FORBIDDEN', 'submit_verdict wysyła tylko serwer (wyrocznia)');
    }
    if (!tx.feePayer?.equals(w)) tx.feePayer = w;
    return { action, txBase64: mod.serializeUnsigned(tx), programId: config.programId, cluster: 'devnet' };
  },

  async confirmAndRead(order, _action, signature) {
    // Nie ufamy klientowi: transakcja musi być potwierdzona, bez błędu i dotyczyć naszego programu,
    // a o wyniku i tak decyduje odczyt konta escrow.
    let tx = null;
    for (let i = 0; i < 30 && !tx; i++) {
      tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (!tx) await sleep(1000);
    }
    if (!tx) throw new ApiErr('TX_NOT_CONFIRMED', 'Transakcja nie została potwierdzona');
    if (tx.meta?.err) throw new ApiErr('TX_NOT_CONFIRMED', `Transakcja nie powiodła się: ${JSON.stringify(tx.meta.err)}`);
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys;
    if (!keys.some((k) => k.equals(programId))) throw new ApiErr('TX_NOT_CONFIRMED', 'Transakcja nie dotyczy programu SellSol');
    const { sdk } = await loadSdk();
    return sdk.getEscrow(order.id);
  },

  async read(orderId) {
    const { sdk } = await loadSdk();
    return sdk.getEscrow(orderId);
  },

  async submitVerdict(orderId, measurements) {
    const { sdk } = await loadSdk();
    return sdk.submitVerdict({ orderId, verifier: requireKey(config.verifier, 'VERIFIER_SECRET_KEY'), measurements });
  },

  async claimTimeout(orderId) {
    const { sdk } = await loadSdk();
    const cranker = config.treasury ?? requireKey(config.verifier, 'TREASURY_SECRET_KEY');
    return sdk.claimTimeout({ orderId, cranker });
  },

  async now() {
    const slot = await connection.getSlot('confirmed');
    return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  },

  async health() {
    try { await connection.getLatestBlockhash('confirmed'); return true; } catch { return false; }
  },
};

export { connection as devnetConnection };
