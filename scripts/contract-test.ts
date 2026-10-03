// Contract-test: pełny przepływ przez REST API (KONTRAKT §8) dla 4 scenariuszy + timeouty + przypadki negatywne.
// Każda odpowiedź przechodzi przez schematy zod z @sellsol/shared. Kod wyjścia ≠ 0 przy błędzie.
//
//   mock:   CHAIN=mock AI=mock npm run dev -w server   →   npx tsx scripts/contract-test.ts
//   devnet: serwer CHAIN=devnet AI=mock, potem
//           API_URL=… DEMO_BUYER_SECRET='[…]' DEMO_SELLER_SECRET='[…]' RPC_URL=… npx tsx scripts/contract-test.ts --only ok
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { z } from 'zod';
import {
  ApiErrorSchema, AuthResponseSchema, type DemoScenario, HealthSchema, ListingSchema, type Order, OrderSchema,
  type OutcomeReason, PreparedTxSchema, SealSchema, sealHash, type TxAction, UploadResultSchema, UserSchema,
  VerificationSchema, VideoUploadResponseSchema,
} from '@sellsol/shared';

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Fail extends Error {}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Fail(msg); }

// ---------- HTTP ----------

async function call<S extends z.ZodType>(schema: S, method: string, path: string,
  o: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; expect?: number } = {}): Promise<z.infer<S>> {
  const headers: Record<string, string> = { ...o.headers };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  const json = await res.json().catch(() => null);
  if (o.expect && res.status !== o.expect) throw new Fail(`${method} ${path}: HTTP ${res.status}, oczekiwano ${o.expect}: ${JSON.stringify(json)}`);
  if (!o.expect && !res.ok) throw new Fail(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(json)}`);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Fail(`${method} ${path}: odpowiedź niezgodna z kontraktem: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  return parsed.data;
}

async function expectError(code: string, status: number, method: string, path: string, o: Parameters<typeof call>[3] = {}) {
  const e = await call(ApiErrorSchema, method, path, { ...o, expect: status });
  assert(e.error.code === code, `${method} ${path}: kod ${e.error.code}, oczekiwano ${code}`);
}

// ---------- podpis: MOCK albo prawdziwy klucz demo ----------

const conn = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
const keyFrom = (v?: string) => (v ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v))) : null);
const keys = { buyer: keyFrom(process.env.DEMO_BUYER_SECRET), seller: keyFrom(process.env.DEMO_SELLER_SECRET) };

async function signAndSend(txBase64: string, who: 'buyer' | 'seller'): Promise<string> {
  if (txBase64 === 'MOCK') return `MOCK${randomBytes(16).toString('hex')}`;
  const kp = keys[who];
  assert(kp, `Brak DEMO_${who.toUpperCase()}_SECRET do podpisu transakcji devnet`);
  const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
  tx.partialSign(kp);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const bh = await conn.getLatestBlockhash('confirmed');
  await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  return sig;
}

// ---------- kroki ----------

interface Actor { token: string; who: 'buyer' | 'seller' }

async function login(email: string, who: Actor['who']): Promise<Actor> {
  const r = await call(AuthResponseSchema, 'POST', '/api/auth/login', { body: { email, password: 'demo1234' } });
  const kp = keys[who];
  if (kp && r.user.walletAddress !== kp.publicKey.toBase58())
    await call(UserSchema, 'PATCH', '/api/me', { token: r.token, body: { walletAddress: kp.publicKey.toBase58() } });
  return { token: r.token, who };
}

async function tx(a: Actor, orderId: string, action: TxAction): Promise<Order> {
  const p = await call(PreparedTxSchema, 'POST', `/api/orders/${orderId}/tx/prepare`, { token: a.token, body: { action } });
  assert(p.action === action, 'PreparedTx.action');
  const signature = await signAndSend(p.txBase64, a.who);
  return call(OrderSchema, 'POST', `/api/orders/${orderId}/tx`, { token: a.token, body: { action, signature } });
}

function videoForm(markers: object): FormData {
  const f = new FormData();
  // Bez TEST_VIDEO: losowe bajty, więc każdy upload ma inny hasz. Z TEST_VIDEO: ten sam plik (i hasz)
  // we wszystkich zamówieniach; to wystarcza przy AI=mock, bo wynik wybiera nagłówek X-Demo-Scenario.
  const bytes = process.env.TEST_VIDEO ? fs.readFileSync(process.env.TEST_VIDEO) : randomBytes(64 * 1024);
  f.set('video', new Blob([bytes], { type: 'video/mp4' }), 'test.mp4');
  f.set('markers', JSON.stringify(markers));
  return f;
}

async function waitVerification(a: Actor, id: string) {
  for (let i = 0; i < 120; i++) {
    const v = await call(VerificationSchema, 'GET', `/api/verifications/${id}`, { token: a.token });
    if (v.status !== 'processing') return v;
    await sleep(1000);
  }
  throw new Fail(`Weryfikacja ${id} nie skończyła się w 120 s`);
}

async function waitOrder(a: Actor, id: string, pred: (o: Order) => boolean, what: string, secs = 90) {
  for (let i = 0; i < secs; i++) {
    const o = await call(OrderSchema, 'GET', `/api/orders/${id}`, { token: a.token });
    if (pred(o)) return o;
    await sleep(1000);
  }
  throw new Fail(`Zamówienie ${id}: nie doczekano się: ${what}`);
}

const mockMode = async () => (await call(HealthSchema, 'GET', '/api/health')).cluster === 'mock';

async function advanceOrWait(secs: number) {
  if (await mockMode()) await call(z.object({ chainNow: z.number() }), 'POST', '/api/dev/clock', { body: { advanceSecs: secs } });
  else await sleep(secs * 1000);
}

async function newListing(seller: Actor, windowSecs: number) {
  const photo = new FormData();
  photo.set('file', new Blob([randomBytes(2048)], { type: 'image/jpeg' }), 'kurtka.jpg');
  const up = await call(UploadResultSchema, 'POST', '/api/uploads', { token: seller.token, form: photo, expect: 201 });
  return call(ListingSchema, 'POST', '/api/listings', { token: seller.token, expect: 201, body: {
    title: "Kurtka jeansowa Levi's, rozmiar M", description: 'Contract-test', categoryId: 'odziez-meska', condition: 'dobry',
    size: 'M', brand: "Levi's", priceLamports: '20000000', photos: [up.url], declaredWeightG: 900,
    dimensionsCm: { l: 40, w: 30, h: 8 }, extraTests: [{ id: 't1', description: 'Pokaż metkę z rozmiarem M' }],
    windows: { shipWindowSecs: windowSecs, openWindowSecs: windowSecs },
  } });
}

async function fundedOrder(buyer: Actor, seller: Actor, windowSecs: number) {
  const listing = await newListing(seller, windowSecs);
  let o = await call(OrderSchema, 'POST', '/api/orders', { token: buyer.token, body: { listingId: listing.id }, expect: 201 });
  assert(o.status === 'awaiting_payment' && o.chainStatus === 'none', `nowe zamówienie: ${o.status}`);
  assert(o.listing.status === 'reserved', 'oferta → reserved');
  await expectError('FORBIDDEN', 403, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: seller.token, body: { action: 'fund' } });
  o = await tx(buyer, o.id, 'fund');
  assert(o.chainStatus === 'Funded' && o.status === 'funded', `po fund: ${o.chainStatus}/${o.status}`);
  assert(o.shipDeadline != null && o.txs.some((t) => t.action === 'fund'), 'shipDeadline i txs po fund');
  await expectError('INVALID_STATE', 409, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: buyer.token, body: { action: 'fund' } });
  return o;
}

async function shippedOrder(buyer: Actor, seller: Actor, windowSecs: number) {
  let o = await fundedOrder(buyer, seller, windowSecs);
  await expectError('INVALID_STATE', 409, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: seller.token, body: { action: 'commit_shipment' } });
  const seal = await call(SealSchema, 'POST', `/api/orders/${o.id}/seal`, { token: seller.token, expect: 201 });
  assert(seal.qrPayload && sealHash(seal.qrPayload) === seal.sealHash, 'plomba: sealHash = sha256(qrPayload)');
  const again = await call(SealSchema, 'POST', `/api/orders/${o.id}/seal`, { token: seller.token });
  assert(again.sealHash === seal.sealHash, 'plomba idempotentna');
  const asBuyer = await call(OrderSchema, 'GET', `/api/orders/${o.id}`, { token: buyer.token });
  assert(asBuyer.seal && !asBuyer.seal.qrPayload, 'kupujący nie widzi qrPayload');

  const up = await call(VideoUploadResponseSchema, 'POST', `/api/orders/${o.id}/packing-video`,
    { token: seller.token, form: videoForm({ productShownMs: 2000, sealShownMs: 15000 }), expect: 202 });
  o = await call(OrderSchema, 'GET', `/api/orders/${o.id}`, { token: seller.token });
  assert(o.status === 'packing_review', `po uploadzie pakowania: ${o.status}`);
  const v = await waitVerification(seller, up.verificationId);
  assert(v.status === 'done' && v.report?.kind === 'packing' && v.report.videoSha256 === up.videoSha256, `raport pakowania: ${v.status} ${v.error ?? ''}`);
  o = await call(OrderSchema, 'GET', `/api/orders/${o.id}`, { token: seller.token });
  assert(o.status === 'ready_to_ship', `po raporcie pakowania: ${o.status}`);

  o = await tx(seller, o.id, 'commit_shipment');
  assert(o.chainStatus === 'Shipped' && o.status === 'shipped' && o.openDeadline != null, `po commit_shipment: ${o.status}`);
  return o;
}

async function scenario(name: DemoScenario, buyer: Actor, seller: Actor, windowSecs: number) {
  let o = await shippedOrder(buyer, seller, windowSecs);
  const pickupWeight = name === 'swap' ? 620 : 905;
  await call(OrderSchema, 'POST', `/api/orders/${o.id}/locker-event`, { token: seller.token, body: { type: 'dropped_off', lockerId: 'KRA01M', weightG: 900 } });
  o = await call(OrderSchema, 'POST', `/api/orders/${o.id}/locker-event`, { token: buyer.token, body: { type: 'ready_for_pickup', lockerId: 'KRA01M', weightG: pickupWeight } });
  assert(o.status === 'delivered', `po ready_for_pickup: ${o.status}`);

  const up = await call(VideoUploadResponseSchema, 'POST', `/api/orders/${o.id}/unboxing-video`, {
    token: buyer.token, headers: { 'X-Demo-Scenario': name }, expect: 202,
    form: videoForm({ sealShownMs: 1000, openStartMs: 5000, productShownMs: 9000 }),
  });
  const v = await waitVerification(buyer, up.verificationId);
  assert(v.status === 'done' && v.report?.kind === 'unboxing', `raport otwarcia: ${v.status} ${v.error ?? ''}`);

  if (name === 'invalid_recording') {
    assert(!v.report!.recordingValid, 'invalid_recording → recordingValid = false');
    await expectError('RECORDING_INVALID', 409, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: buyer.token, body: { action: 'open_claim' } });
    // Kupujący nie zgłasza ważnego wyniku → po open_deadline każdy może wywołać claim_timeout (OpenTimeout).
    await expectError('INVALID_STATE', 409, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: seller.token, body: { action: 'claim_timeout' } });
    await advanceOrWait(windowSecs + 2);
    o = await tx(seller, o.id, 'claim_timeout');
    return expectOutcome(o, 'released', 'OpenTimeout');
  }

  o = await tx(buyer, o.id, 'open_claim');
  assert(o.chainStatus === 'Verifying' || o.chainStatus === 'Released' || o.chainStatus === 'Refunded', `po open_claim: ${o.chainStatus}`);
  assert(o.unboxingVideoHash === up.videoSha256, 'unboxingVideoHash on-chain = hasz uploadu');
  o = await waitOrder(buyer, o.id, (x) => x.status === 'released' || x.status === 'refunded', 'rozstrzygnięcie przez program');
  assert(o.txs.some((t) => t.action === 'submit_verdict'), 'wyrocznia wysłała submit_verdict');
  assert(o.measurements, 'pomiary zapisane on-chain');
  const expected: Record<Exclude<DemoScenario, 'invalid_recording'>, ['released' | 'refunded', OutcomeReason]> = {
    ok: ['released', 'VerifiedOk'], defect: ['refunded', 'ItemMismatch'], swap: ['refunded', 'TransitBroken'],
  };
  return expectOutcome(o, ...expected[name]);
}

function expectOutcome(o: Order, status: 'released' | 'refunded', reason: OutcomeReason) {
  assert(o.status === status && o.outcomeReason === reason, `wynik: ${o.status}/${o.outcomeReason}, oczekiwano ${status}/${reason}`);
  assert(o.listing.status === (status === 'released' ? 'sold' : 'active'), `oferta po rozstrzygnięciu: ${o.listing.status}`);
  return o;
}

async function shipTimeout(buyer: Actor, seller: Actor, windowSecs: number) {
  let o = await fundedOrder(buyer, seller, windowSecs);
  await advanceOrWait(windowSecs + 2);
  o = await tx(buyer, o.id, 'claim_timeout');
  return expectOutcome(o, 'refunded', 'ShipTimeout');
}

async function sellerDecline(buyer: Actor, seller: Actor, windowSecs: number) {
  let o = await fundedOrder(buyer, seller, windowSecs);
  await expectError('FORBIDDEN', 403, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: buyer.token, body: { action: 'seller_decline' } });
  await expectError('FORBIDDEN', 403, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: seller.token, body: { action: 'submit_verdict' } });
  o = await tx(seller, o.id, 'seller_decline');
  expectOutcome(o, 'refunded', 'SellerDeclined');
  await expectError('INVALID_STATE', 409, 'POST', `/api/orders/${o.id}/tx/prepare`, { token: buyer.token, body: { action: 'confirm_receipt' } });
  return o;
}

async function confirmReceipt(buyer: Actor, seller: Actor, windowSecs: number) {
  let o = await shippedOrder(buyer, seller, windowSecs);
  o = await tx(buyer, o.id, 'confirm_receipt');
  return expectOutcome(o, 'released', 'BuyerConfirmed');
}

// ---------- main ----------

const health = await call(HealthSchema, 'GET', '/api/health');
console.log(`API ${API}: chain=${health.chain} ai=${health.ai} cluster=${health.cluster} programId=${health.programId}`);
const isMock = health.cluster === 'mock';
// Oczekiwania scenariuszy wymagają AI=mock (nagłówek X-Demo-Scenario). Przy AI=http wynik zależy od treści
// nagrania i plomby zamówienia, więc e2e z prawdziwym AI robimy na żywych nagraniach (M3), nie tym skryptem.
if (health.ai.startsWith('http')) {
  console.error('contract-test wymaga AI=mock (CHAIN=mock albo CHAIN=devnet). Dla AI=http użyj e2e na telefonach (M3).');
  process.exit(2);
}
const W = isMock ? 1800 : Number(process.env.TEST_WINDOW_SECS ?? 60);   // devnet: krótkie okna, żeby timeout dało się poczekać

await call(z.array(z.any()), 'GET', '/api/categories');
await call(z.array(ListingSchema), 'GET', '/api/listings');
await expectError('UNAUTHORIZED', 401, 'GET', '/api/me');
await expectError('NOT_FOUND', 404, 'GET', '/api/listings/nie-ma');
const seller = await login('ania@demo.pl', 'seller');
const buyer = await login('bartek@demo.pl', 'buyer');

const cases: [string, () => Promise<unknown>][] = [
  ['ok', () => scenario('ok', buyer, seller, W)],
  ['defect', () => scenario('defect', buyer, seller, W)],
  ['swap', () => scenario('swap', buyer, seller, W)],
  ['invalid_recording', () => scenario('invalid_recording', buyer, seller, W)],
  ['ship_timeout', () => shipTimeout(buyer, seller, W)],
  ['seller_decline', () => sellerDecline(buyer, seller, W)],
  ['confirm_receipt', () => confirmReceipt(buyer, seller, W)],
];

let failed = 0;
for (const [name, run] of cases) {
  if (only && !only.includes(name)) continue;
  const t0 = Date.now();
  try {
    const o = (await run()) as Order;
    console.log(`  ✓ ${name.padEnd(18)} ${o.status}/${o.outcomeReason}  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${o.id}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name.padEnd(18)} ${(e as Error).message}`);
  }
}
console.log(failed ? `\n${failed} nieudanych` : '\nWszystko zielone');
process.exit(failed ? 1 : 0);
