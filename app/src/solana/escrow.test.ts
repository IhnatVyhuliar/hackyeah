// Pre-sign purchase checks of SolanaEscrow without RPC: a fake Connection serves an encoded Deal account
// and records what would be sent. Run: node --import tsx --test app/src/solana/*.test.ts (from the repo root).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { BN, BorshAccountsCoder, BorshInstructionCoder, type Idl } from '@anchor-lang/core';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { isEscrowError } from '@unbox/shared';
import { checkPurchaseArbiter, createEscrowCore } from './escrow';

const idl = JSON.parse(readFileSync('packages/shared/idl/unbox_escrow.json', 'utf8')) as Idl & { address: string };
const programId = new PublicKey(idl.address);
const metadataUri = 'http://server/api/listings/l-kurtka-levis/metadata.json';
const metadata = new TextEncoder().encode('{"v":1,"title":"Kurtka jeansowa Levi\'s"}');

const key = () => Keypair.generate().publicKey;
const zero = () => Array(32).fill(0);

async function encodeDeal(f: { seller: PublicKey; arbiter: PublicKey; listingHash: Uint8Array }): Promise<Buffer> {
  // Raw (snake_case) IDL coder, so fields and enum variants use the IDL spelling.
  return new BorshAccountsCoder(idl).encode('Deal', {
    seller: f.seller, buyer: PublicKey.default, arbiter: f.arbiter, deal_id: new BN(1), price_lamports: new BN(60_000_000),
    listing_hash: Array.from(f.listingHash), status: { Listed: {} }, status_changed_at: new BN(1_000),
    qr_commitment: zero(), packing_video_hash: zero(), unboxing_video_hash: zero(), complaint_hash: zero(),
    verdict: { None: {} }, report_hash: zero(), return_qr_commitment: zero(), return_video_hash: zero(), bump: 255,
    metadata_uri: metadataUri, tracking_number: '', return_tracking_number: '',
  });
}

/** Minimal Connection: one Deal account, records blockhash requests and sent transactions. */
function fakeConnection(deal: PublicKey, data: Buffer) {
  const calls = { blockhash: 0, sent: [] as Buffer[] };
  const conn = {
    commitment: 'confirmed',
    rpcEndpoint: 'http://fake-rpc',
    async getAccountInfoAndContext(address: PublicKey) {
      const value = address.equals(deal) ? { data, owner: programId, lamports: 1, executable: false, rentEpoch: 0 } : null;
      return { context: { slot: 1 }, value };
    },
    async getLatestBlockhash() {
      calls.blockhash++;
      return { blockhash: key().toBase58(), lastValidBlockHeight: 1_000 };
    },
    async sendRawTransaction(raw: Uint8Array) {
      calls.sent.push(Buffer.from(raw));
      return 'sig-fake';
    },
    async confirmTransaction() {
      return { context: { slot: 1 }, value: { err: null } };
    },
  };
  return { conn: conn as unknown as Connection, calls };
}

let partialSign: ReturnType<typeof mock.method>;
beforeEach(() => {
  partialSign = mock.method(Transaction.prototype, 'partialSign');
});
afterEach(() => mock.restoreAll());

async function setup(o: { trusted: PublicKey; dealArbiter: PublicKey; seller?: PublicKey; served?: Uint8Array | null }) {
  const seller = o.seller ?? key();
  const deal = key();
  const data = await encodeDeal({ seller, arbiter: o.dealArbiter, listingHash: sha256(metadata) });
  const { conn, calls } = fakeConnection(deal, data);
  const served = o.served === undefined ? metadata : o.served;
  const escrow = createEscrowCore({
    connection: conn, keypair: Keypair.generate(), idl, trustedArbiter: o.trusted,
    fetchBytes: async (url) => (url === metadataUri ? served : null),
  });
  return { escrow, calls, k: { id: 'l-kurtka-levis', deal: deal.toBase58() } };
}

const nothingSigned = (calls: { blockhash: number; sent: Buffer[] }) => {
  assert.equal(calls.sent.length, 0, 'nothing sent');
  assert.equal(calls.blockhash, 0, 'no blockhash fetched for signing');
  assert.equal(partialSign.mock.callCount(), 0, 'nothing signed');
};
const escrowCode = (code: string) => (e: unknown) => isEscrowError(e) && e.code === code;

test('checkPurchaseArbiter: trusted == deal arbiter passes; mismatch and arbiter == seller are rejected', () => {
  const [oracle, seller] = [key(), key()];
  assert.doesNotThrow(() => checkPurchaseArbiter({ trustedArbiter: oracle, dealArbiter: new PublicKey(oracle.toBytes()), seller }));
  assert.throws(() => checkPurchaseArbiter({ trustedArbiter: oracle, dealArbiter: key(), seller }), escrowCode('ArbiterMismatch'));
  assert.throws(() => checkPurchaseArbiter({ trustedArbiter: seller, dealArbiter: seller, seller }), escrowCode('ArbiterMismatch'));
});

test('correct trusted arbiter: purchase(expectedListingHash = sha256(fetched bytes), trustedArbiter) is signed and sent', async () => {
  const oracle = key();
  const { escrow, calls, k } = await setup({ trusted: oracle, dealArbiter: new PublicKey(oracle.toBytes()) });
  const r = await escrow.purchase(k);
  assert.equal(r.signature, 'sig-fake');
  assert.equal(calls.sent.length, 1);
  assert.ok(partialSign.mock.callCount() >= 1);
  const ix = Transaction.from(calls.sent[0]).instructions.find((i) => i.programId.equals(programId))!;
  const decoded = new BorshInstructionCoder(idl).decode(ix.data) as { name: string; data: { expected_listing_hash: number[]; expected_arbiter: PublicKey } };
  assert.equal(decoded.name, 'purchase');
  assert.ok(decoded.data.expected_arbiter.equals(oracle), 'expected_arbiter is the trusted key');
  assert.deepEqual(Uint8Array.from(decoded.data.expected_listing_hash), sha256(metadata));
});

test('foreign arbiter on the Deal → ArbiterMismatch before signing or sending', async () => {
  const { escrow, calls, k } = await setup({ trusted: key(), dealArbiter: key() });
  await assert.rejects(escrow.purchase(k), escrowCode('ArbiterMismatch'));
  nothingSigned(calls);
});

test('arbiter == seller → rejected before signing, even when it is the trusted key', async () => {
  const seller = key();
  const { escrow, calls, k } = await setup({ trusted: seller, dealArbiter: seller, seller });
  await assert.rejects(escrow.purchase(k), escrowCode('ArbiterMismatch'));
  nothingSigned(calls);
});

test('changed or missing metadata.json → ListingMismatch before signing or sending', async () => {
  const oracle = key();
  for (const served of [new TextEncoder().encode('{"v":1,"title":"Inna kurtka"}'), null]) {
    const { escrow, calls, k } = await setup({ trusted: oracle, dealArbiter: oracle, served });
    await assert.rejects(escrow.purchase(k), escrowCode('ListingMismatch'));
    nothingSigned(calls);
  }
});
