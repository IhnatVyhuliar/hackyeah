// SolanaEscrow core: no React Native imports, so tests/escrow-client.test.ts runs it against Surfpool.
// Every check here is also enforced by the program; checks before signing only save the user a fee.
import { AnchorProvider, BN, Program, type Idl } from '@anchor-lang/core';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_CLOCK_PUBKEY, Transaction, VersionedTransaction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { EscrowError, type DealKey, type Escrow, type TxResult } from '@unbox/shared';
import type { UnboxEscrow } from '../../../packages/shared/idl/unbox_escrow';
import { toEscrowError } from './errors';
import { encodeQr, parseQr, returnCommitment, shipCommitment, type QrKind } from './qr';

export interface EscrowDeps {
  connection: Connection;
  keypair: Keypair;
  idl: Idl;
  trustedArbiter: PublicKey;
  fetchBytes: (url: string) => Promise<Uint8Array | null>;
  cluster?: string;   // Explorer ?cluster=, default devnet
}

const b32 = (hex: string) => Array.from(hexToBytes(hex));
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

/**
 * The buyer accepts only the app's trusted arbiter (never deal.arbiter as the expected value), and a seller
 * may not judge their own sale. Same rule as unbox-cli `accepted_arbiter`; the program checks only the first.
 */
export function checkPurchaseArbiter(i: { trustedArbiter: PublicKey; dealArbiter: PublicKey; seller: PublicKey }): void {
  if (!i.dealArbiter.equals(i.trustedArbiter)) {
    throw new EscrowError('ArbiterMismatch', 'Weryfikator w tej umowie jest inny niż ten, któremu ufa aplikacja. Zakup wstrzymany, nic nie zostało pobrane.');
  }
  if (i.dealArbiter.equals(i.seller)) {
    throw new EscrowError('ArbiterMismatch', 'Sprzedający jest weryfikatorem własnej sprzedaży. Zakup wstrzymany, nic nie zostało pobrane.');
  }
}

export function createEscrowCore(d: EscrowDeps): Escrow {
  const me = d.keypair.publicKey;
  const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([d.keypair]);
    else tx.partialSign(d.keypair);
    return tx;
  };
  const wallet = { publicKey: me, signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => sign(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs.map(sign) };
  const provider = new AnchorProvider(d.connection, wallet as never, { commitment: 'confirmed', preflightCommitment: 'confirmed' });
  const program = new Program<UnboxEscrow>(d.idl as UnboxEscrow, provider);
  const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${d.cluster ?? 'devnet'}`;

  async function run(send: () => Promise<string>): Promise<TxResult> {
    try {
      const sig = await send();
      return { signature: sig, explorerUrl: explorer(sig) };
    } catch (e) {
      throw toEscrowError(e);
    }
  }
  const dealOf = (k: DealKey) => {
    if (!k.deal) throw new EscrowError('Rejected', 'To ogłoszenie nie jest jeszcze zapisane w umowie.');
    return new PublicKey(k.deal);
  };
  const account = async (deal: PublicKey) => {
    try { return await program.account.deal.fetch(deal); } catch (e) { throw toEscrowError(e); }
  };
  function secretFor(kind: QrKind, deal: PublicKey, payload: string, commitment: number[]): number[] {
    const q = parseQr(payload);
    const expected = q && (kind === 'ship' ? shipCommitment(q.deal, q.secret) : returnCommitment(q.deal, q.secret));
    if (!q || q.kind !== kind || !q.deal.equals(deal) || !expected || !same(expected, commitment)) {
      throw new EscrowError('QrMismatch', kind === 'ship'
        ? 'Kod z karty nie pasuje do tej przesyłki. Umowa jest bez zmian – zeskanuj kartę z tej paczki.'
        : 'Kod nie pasuje do karty zwrotu tej umowy. Zeskanuj kartę zwrotu z odesłanej paczki.');
    }
    return Array.from(q.secret);
  }

  return {
    mode: 'solana',
    walletAddress: async () => me.toBase58(),
    async networkNow() {
      const info = await d.connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, 'confirmed');
      if (!info) throw new EscrowError('Network', 'Nie udało się odczytać czasu sieci.');
      return Number(new DataView(info.data.buffer, info.data.byteOffset).getBigInt64(32, true));
    },
    async requestTestSol() {
      try {
        const sig = await d.connection.requestAirdrop(me, LAMPORTS_PER_SOL);
        await d.connection.confirmTransaction({ signature: sig, ...(await d.connection.getLatestBlockhash()) }, 'confirmed');
        return { signature: sig, explorerUrl: explorer(sig) };
      } catch {
        throw new EscrowError('Network', 'Kran testowych SOL nie odpowiada. Spróbuj za minutę albo poproś zespół o przelew.');
      }
    },
    async createListing(a) {
      const deal = new PublicKey(a.deal);
      const [pda] = PublicKey.findProgramAddressSync([Buffer.from('deal'), me.toBuffer(), new BN(a.dealId).toArrayLike(Buffer, 'le', 8)], program.programId);
      if (!pda.equals(deal)) throw new EscrowError('Rejected', 'Serwer podał adres umowy dla innego portfela.');
      if (!new PublicKey(a.arbiter).equals(d.trustedArbiter)) throw new EscrowError('ArbiterMismatch', 'Serwer podał innego weryfikatora niż ten, któremu ufa aplikacja.');
      const bytes = await d.fetchBytes(a.metadataUri);
      if (!bytes || bytesToHex(sha256(bytes)) !== a.listingHash) throw new EscrowError('ListingMismatch', 'Opis udostępniony przez serwer różni się od tego, który miał trafić do umowy.');
      return run(() => program.methods.createListing(new BN(a.dealId), new BN(a.priceLamports), b32(a.listingHash), a.metadataUri, d.trustedArbiter)
        .accountsPartial({ seller: me, deal }).rpc());
    },
    cancelListing: async (k) => run(() => program.methods.cancelListing().accountsPartial({ seller: me, deal: dealOf(k) }).rpc()),
    async purchase(k) {
      const deal = dealOf(k);
      const acc = await account(deal);
      checkPurchaseArbiter({ trustedArbiter: d.trustedArbiter, dealArbiter: acc.arbiter, seller: acc.seller });
      const bytes = await d.fetchBytes(acc.metadataUri);
      const seen = bytes ? sha256(bytes) : null;
      if (!seen || !same(seen, acc.listingHash)) throw new EscrowError('ListingMismatch', 'Opis ogłoszenia różni się od zapisanego w umowie. Zakup wstrzymany, nic nie zostało pobrane.');
      return run(() => program.methods.purchase(Array.from(seen), d.trustedArbiter).accountsPartial({ buyer: me, deal }).rpc());
    },
    async newQrCard(kind, k) {
      const deal = dealOf(k);
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const c = kind === 'ship' ? shipCommitment(deal, secret) : returnCommitment(deal, secret);
      return { kind, payload: encodeQr(kind, deal, secret), commitment: bytesToHex(c) };
    },
    markShipped: async (k, i) => run(() => program.methods.markShipped(b32(i.qrCommitment), b32(i.packingVideoSha256), i.trackingNumber)
      .accountsPartial({ seller: me, deal: dealOf(k) }).rpc()),
    async acceptDelivery(k, payload) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('ship', deal, payload, acc.qrCommitment);
      return run(() => program.methods.acceptDelivery(secret).accountsPartial({ buyer: me, deal, seller: acc.seller }).rpc());
    },
    async openDispute(k, i) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('ship', deal, i.qrPayload, acc.qrCommitment);
      return run(() => program.methods.openDispute(secret, b32(i.unboxingVideoSha256), b32(i.complaintSha256))
        .accountsPartial({ buyer: me, deal }).rpc());
    },
    markReturned: async (k, i) => run(() => program.methods.markReturned(b32(i.returnQrCommitment), b32(i.returnVideoSha256), i.trackingNumber)
      .accountsPartial({ buyer: me, deal: dealOf(k) }).rpc()),
    async confirmReturn(k, payload) {
      const deal = dealOf(k);
      const acc = await account(deal);
      const secret = secretFor('return', deal, payload, acc.returnQrCommitment);
      return run(() => program.methods.confirmReturn(secret).accountsPartial({ seller: me, deal, buyer: acc.buyer }).rpc());
    },
    async settleExpired(k) {
      const deal = dealOf(k);
      const acc = await account(deal);
      return run(() => program.methods.settleExpired().accountsPartial({ caller: me, deal, seller: acc.seller, buyer: acc.buyer }).rpc());
    },
  };
}
