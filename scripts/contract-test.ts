// Contract-test backendu sklepu: pełne ścieżki przez REST API, każda odpowiedź walidowana schematami z @unbox/shared.
// Bez blockchaina i zewnętrznych usług. Kod wyjścia ≠ 0 przy błędzie.
//
//   ENABLE_DEV_CLOCK=1 AI=mock MOCK_AI_DELAY_MS=300 AI_RETRY_MS=100 AI_MAX_ATTEMPTS=2 npm run dev -w server
//   npx tsx scripts/contract-test.ts [--only ok,defect]
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  ApiErrorSchema, AuthResponseSchema, type Deal, DealSchema, hashDocument, HealthSchema, type Listing, ListingSchema,
  MediaUploadSchema, newQrSecret, returnCommitment, shipCommitment, TIMEOUTS_DEMO, TIMEOUTS_PROD, WalletSchema,
} from '@unbox/shared';

const API = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Fail extends Error {}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Fail(msg); }

// ---------- HTTP ----------

type Opts = { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string>; expect?: number };

async function call<S extends z.ZodType>(schema: S, method: string, path: string, o: Opts = {}): Promise<z.infer<S>> {
  const headers: Record<string, string> = { ...o.headers };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, { method, headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
  const json = await res.json().catch(() => null);
  if (o.expect ? res.status !== o.expect : !res.ok)
    throw new Fail(`${method} ${path}: HTTP ${res.status}${o.expect ? `, oczekiwano ${o.expect}` : ''}: ${JSON.stringify(json)}`);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Fail(`${method} ${path}: odpowiedź niezgodna ze schematem: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  return parsed.data;
}

const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, UNAUTHORIZED: 401 };
async function expectError(code: string, method: string, path: string, o: Opts = {}) {
  const e = await call(ApiErrorSchema, method, path, { ...o, expect: STATUS[code] ?? 409 });
  assert(e.error.code === code, `${method} ${path}: kod ${e.error.code}, oczekiwano ${code}`);
}

// ---------- aktorzy i pomocnicze ----------

interface Actor { token: string; id: string; name: string }
async function login(email: string): Promise<Actor> {
  const r = await call(AuthResponseSchema, 'POST', '/api/auth/login', { body: { email, password: 'demo1234' } });
  return { token: r.token, id: r.user.id, name: r.user.name };
}
const balance = async (a: Actor) => (await call(WalletSchema, 'GET', '/api/me/wallet', { token: a.token })).balanceMinor;

async function upload(a: Actor, mimeType: string) {
  const f = new FormData();
  f.set('file', new Blob([randomBytes(32 * 1024)], { type: mimeType }), mimeType.startsWith('video') ? 'v.mp4' : 'p.jpg');
  const m = await call(MediaUploadSchema, 'POST', '/api/media', { token: a.token, form: f, expect: 201 });
  const got = await fetch(m.url);
  assert(got.ok && got.headers.get('content-type') === mimeType, `GET ${m.url} zwraca plik`);
  return m;
}

const getDeal = (a: Actor, id: string) => call(DealSchema, 'GET', `/api/deals/${id}`, { token: a.token });
const act = (a: Actor, id: string, action: string, body: unknown = {}, headers?: Record<string, string>) =>
  call(DealSchema, 'POST', `/api/deals/${id}/${action}`, { token: a.token, body, headers });

let timeouts = TIMEOUTS_DEMO;
async function advance(secs: number) {
  await call(z.object({ now: z.number() }), 'POST', '/api/dev/clock', { body: { advanceSecs: secs } });
}

async function waitAnalysis(a: Actor, id: string, done: (d: Deal) => boolean, what: string) {
  for (let i = 0; i < 60; i++) {
    const d = await getDeal(a, id);
    if (done(d)) return d;
    await sleep(250);
  }
  throw new Fail(`${id}: nie doczekano się: ${what}`);
}

function expectClosed(d: Deal, status: 'Completed' | 'Refunded', closeReason: Deal['closeReason']) {
  assert(d.status === status && d.closeReason === closeReason, `wynik ${d.status}/${d.closeReason}, oczekiwano ${status}/${closeReason}`);
  assert(d.payment.status === (status === 'Completed' ? 'released' : 'refunded') && d.payment.settledAt != null, `płatność: ${d.payment.status}`);
  assert(d.deadlineAt === null, 'brak terminu w stanie końcowym');
}

// ---------- kroki przepływu ----------

async function newListing(seller: Actor, price = 1_500): Promise<Listing> {
  const photo = await upload(seller, 'image/jpeg');
  return call(ListingSchema, 'POST', '/api/listings', { token: seller.token, expect: 201, body: {
    title: "Kurtka jeansowa Levi's", description: 'Contract-test', categoryId: 'odziez-meska', condition: 'dobry',
    brand: "Levi's", size: 'M', defects: ['Lekkie przetarcie mankietu'], photos: [photo], priceMinor: price,
  } });
}

async function paidDeal(seller: Actor, buyer: Actor, stranger: Actor) {
  const l = await newListing(seller);
  const before = await balance(buyer);
  await expectError('FORBIDDEN', 'POST', `/api/listings/${l.id}/purchase`, { token: seller.token });
  const d = await call(DealSchema, 'POST', `/api/listings/${l.id}/purchase`, { token: buyer.token, expect: 201 });
  assert(d.status === 'Paid' && d.payment.status === 'secured' && d.deadlineAt === d.statusChangedAt + timeouts.Paid, `po zakupie: ${d.status}`);
  assert(d.listingHash === hashDocument(d.listing), 'listingHash = sha256(canonicalJson(listing))');
  assert(await balance(buyer) === before - l.priceMinor, 'saldo kupującego pomniejszone o cenę');
  await expectError('INVALID_STATE', 'POST', `/api/listings/${l.id}/purchase`, { token: stranger.token });
  await expectError('INVALID_STATE', 'PATCH', `/api/listings/${l.id}`, { token: seller.token, body: { priceMinor: 1 } });
  await expectError('FORBIDDEN', 'GET', `/api/deals/${d.id}`, { token: stranger.token });
  const listed = await call(z.array(ListingSchema), 'GET', '/api/listings');
  assert(!listed.some((x) => x.id === l.id), 'kupione ogłoszenie znika z listy');
  return { listing: l, deal: d };
}

async function shippedDeal(seller: Actor, buyer: Actor, stranger: Actor) {
  const { deal } = await paidDeal(seller, buyer, stranger);
  const secret = newQrSecret();
  const video = await upload(seller, 'video/mp4');
  const body = { qrCommitment: shipCommitment(deal.id, secret), packingVideoSha256: video.sha256, trackingNumber: 'INP0001' };
  await expectError('FORBIDDEN', 'POST', `/api/deals/${deal.id}/ship`, { token: buyer.token, body });
  await expectError('FORBIDDEN', 'POST', `/api/deals/${deal.id}/ship`, { token: stranger.token, body });
  const foreignVideo = await upload(buyer, 'video/mp4');
  await expectError('VALIDATION', 'POST', `/api/deals/${deal.id}/ship`, { token: seller.token, body: { ...body, packingVideoSha256: foreignVideo.sha256 } });
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/accept`, { token: buyer.token, body: { qrSecret: secret } });
  const d = await act(seller, deal.id, 'ship', body);
  assert(d.status === 'Shipped' && d.packingVideoSha256 === video.sha256 && d.trackingNumber === 'INP0001', `po nadaniu: ${d.status}`);
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/ship`, { token: seller.token, body });
  return { deal: d, secret };
}

async function disputedDeal(seller: Actor, buyer: Actor, stranger: Actor, scenario: string) {
  const { deal, secret } = await shippedDeal(seller, buyer, stranger);
  const video = await upload(buyer, 'video/mp4');
  const body = { qrSecret: secret, unboxingVideoSha256: video.sha256, complaint: { category: 'damaged', description: 'Plama na rękawie' } };
  await expectError('QR_MISMATCH', 'POST', `/api/deals/${deal.id}/dispute`, { token: buyer.token, body: { ...body, qrSecret: newQrSecret() } });
  await expectError('FORBIDDEN', 'POST', `/api/deals/${deal.id}/dispute`, { token: seller.token, body });
  const d = await act(buyer, deal.id, 'dispute', body, { 'X-Demo-Scenario': scenario });
  assert(d.status === 'Disputed' && d.unboxingVideoSha256 === video.sha256 && d.complaint?.category === 'damaged', `po reklamacji: ${d.status}`);
  assert(d.complaintHash === hashDocument(d.complaint), 'complaintHash = sha256(canonicalJson(complaint))');
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/accept`, { token: buyer.token, body: { qrSecret: secret } });
  return { deal: d, secret };
}

/** Analiza zakończona: raport zapisany, werdykt = decide(raport), stan zmieniony przez backend. */
async function resolved(buyer: Actor, id: string) {
  const d = await waitAnalysis(buyer, id, (x) => x.status !== 'Disputed', 'rozstrzygnięcie reklamacji');
  const a = d.analysis;
  assert(a?.status === 'done' && a.report && a.verdict && a.model && a.promptVersion, 'raport AI zapisany w transakcji');
  assert(a.reportHash === hashDocument(a.report), 'reportHash = sha256(canonicalJson(report))');
  assert(d.verdict === a.verdict, 'werdykt transakcji = werdykt z analizy');
  return d;
}

async function returnFlow(seller: Actor, buyer: Actor, stranger: Actor, id: string) {
  const secret = newQrSecret();
  const video = await upload(buyer, 'video/mp4');
  const body = { returnQrCommitment: returnCommitment(id, secret), returnVideoSha256: video.sha256, returnTrackingNumber: 'INP0002' };
  await expectError('FORBIDDEN', 'POST', `/api/deals/${id}/return`, { token: seller.token, body });
  let d = await act(buyer, id, 'return', body);
  assert(d.status === 'Returning', `po odesłaniu: ${d.status}`);
  await expectError('QR_MISMATCH', 'POST', `/api/deals/${id}/confirm-return`, { token: seller.token, body: { returnQrSecret: newQrSecret() } });
  await expectError('FORBIDDEN', 'POST', `/api/deals/${id}/confirm-return`, { token: stranger.token, body: { returnQrSecret: secret } });
  d = await act(seller, id, 'confirm-return', { returnQrSecret: secret });
  return d;
}

// ---------- scenariusze ----------

type Ctx = { seller: Actor; buyer: Actor; stranger: Actor };

async function confirmReceipt({ seller, buyer, stranger }: Ctx) {
  const sellerBefore = await balance(seller);
  const { deal, secret } = await shippedDeal(seller, buyer, stranger);
  await expectError('QR_MISMATCH', 'POST', `/api/deals/${deal.id}/accept`, { token: buyer.token, body: { qrSecret: newQrSecret() } });
  await expectError('FORBIDDEN', 'POST', `/api/deals/${deal.id}/accept`, { token: stranger.token, body: { qrSecret: secret } });
  const d = await act(buyer, deal.id, 'accept', { qrSecret: secret });
  expectClosed(d, 'Completed', 'accepted');
  assert(await balance(seller) === sellerBefore + deal.payment.amountMinor, 'sprzedający dostał środki');
  // drugie rozliczenie niemożliwe
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/accept`, { token: buyer.token, body: { qrSecret: secret } });
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/settle`, { token: buyer.token });
  assert(await balance(seller) === sellerBefore + deal.payment.amountMinor, 'brak podwójnej wypłaty');
  return d;
}

async function disputeSellerWins(ctx: Ctx, scenario: 'ok' | 'swap' | 'invalid_recording') {
  const { deal } = await disputedDeal(ctx.seller, ctx.buyer, ctx.stranger, scenario);
  const d = await resolved(ctx.buyer, deal.id);
  assert(d.verdict === 'SELLER', `werdykt ${d.verdict}, oczekiwano SELLER`);
  expectClosed(d, 'Completed', 'verdict_seller');
  if (scenario === 'swap') assert(d.analysis!.report!.package_matches_shipping_recording === false, 'pomiar: paczka niezgodna z nadaną');
  if (scenario === 'invalid_recording') assert(d.analysis!.report!.buyer_recording.continuous === false, 'pomiar: nagranie nieciągłe');
  return d;
}

async function defect({ seller, buyer, stranger }: Ctx) {
  const buyerBefore = await balance(buyer);
  const { deal } = await disputedDeal(seller, buyer, stranger, 'defect');
  let d = await resolved(buyer, deal.id);
  assert(d.verdict === 'BUYER' && d.status === 'ReturnRequested' && d.payment.status === 'secured', `po werdykcie: ${d.status}`);
  assert(d.analysis!.report!.undisclosed_damage.present, 'pomiar: nieujawniona wada');
  d = await returnFlow(seller, buyer, stranger, deal.id);
  expectClosed(d, 'Refunded', 'return_confirmed');
  assert(await balance(buyer) === buyerBefore, 'kupujący odzyskał środki');
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/confirm-return`, { token: seller.token, body: { returnQrSecret: newQrSecret() } });
  assert(await balance(buyer) === buyerBefore, 'brak podwójnego zwrotu');
  return d;
}

async function shipTimeout({ seller, buyer, stranger }: Ctx) {
  const buyerBefore = await balance(buyer);
  const { deal } = await paidDeal(seller, buyer, stranger);
  await expectError('DEADLINE_NOT_REACHED', 'POST', `/api/deals/${deal.id}/settle`, { token: buyer.token });
  await advance(timeouts.Paid - 5);
  assert((await getDeal(buyer, deal.id)).status === 'Paid', 'przed terminem nadal Paid');
  await advance(10);
  const d = await getDeal(buyer, deal.id);           // leniwe domknięcie przy odczycie
  expectClosed(d, 'Refunded', 'ship_timeout');
  assert(await balance(buyer) === buyerBefore, 'zwrot po terminie nadania');
  const late = await upload(seller, 'video/mp4');
  await expectError('INVALID_STATE', 'POST', `/api/deals/${deal.id}/ship`, { token: seller.token,
    body: { qrCommitment: 'a'.repeat(64), packingVideoSha256: late.sha256, trackingNumber: 'INP0003' } });
  return d;
}

async function unboxAndReturnTimeouts({ seller, buyer, stranger }: Ctx) {
  const { deal } = await shippedDeal(seller, buyer, stranger);
  await advance(timeouts.Shipped);
  expectClosed(await act(buyer, deal.id, 'settle'), 'Completed', 'unbox_timeout');
  const { deal: d2 } = await disputedDeal(seller, buyer, stranger, 'defect');
  await resolved(buyer, d2.id);
  await advance(timeouts.ReturnRequested);
  const d = await getDeal(seller, d2.id);
  expectClosed(d, 'Completed', 'return_ship_timeout');
  return d;
}

/** Błędny raport albo raport o innych nagraniach nie zmienia stanu; po terminie oceny: neutralny zwrot towaru. */
async function invalidReport(ctx: Ctx, scenario: 'invalid_report' | 'wrong_evidence' | 'ai_down') {
  const { deal } = await disputedDeal(ctx.seller, ctx.buyer, ctx.stranger, scenario);
  let d = await waitAnalysis(ctx.buyer, deal.id, (x) => x.analysis?.status === 'failed', 'analiza: failed');
  assert(d.status === 'Disputed' && d.verdict === null && d.payment.status === 'secured', `stan po błędnym raporcie: ${d.status}`);
  assert(d.analysis!.report === null && d.analysis!.error, 'raport odrzucony, błąd zapisany');
  await advance(timeouts.Disputed);
  d = await getDeal(ctx.buyer, deal.id);
  assert(d.status === 'ReturnRequested' && d.verdict === null && d.payment.status === 'secured', `po terminie oceny: ${d.status}`);
  return d;
}

async function cancelListing({ seller, buyer, stranger }: Ctx) {
  const l = await newListing(seller);
  await expectError('FORBIDDEN', 'POST', `/api/listings/${l.id}/cancel`, { token: buyer.token });
  const edited = await call(ListingSchema, 'PATCH', `/api/listings/${l.id}`, { token: seller.token, body: { priceMinor: 9_900 } });
  assert(edited.priceMinor === 9_900, 'edycja przed zakupem');
  const c = await call(ListingSchema, 'POST', `/api/listings/${l.id}/cancel`, { token: seller.token });
  assert(c.status === 'Cancelled', 'anulowane');
  await expectError('INVALID_STATE', 'POST', `/api/listings/${l.id}/purchase`, { token: buyer.token });
  await expectError('INVALID_STATE', 'POST', `/api/listings/${l.id}/cancel`, { token: seller.token });
  const { listing: sold } = await paidDeal(seller, buyer, stranger);
  await expectError('INVALID_STATE', 'POST', `/api/listings/${sold.id}/cancel`, { token: seller.token });
  return { status: 'Cancelled', closeReason: null, id: l.id } as unknown as Deal;
}

// ---------- main ----------

const health = await call(HealthSchema, 'GET', '/api/health');
timeouts = health.timeouts === 'prod' ? TIMEOUTS_PROD : TIMEOUTS_DEMO;
console.log(`API ${API}: ai=${health.ai} timeouts=${health.timeouts}`);
if (!health.ai.startsWith('mock')) { console.error('contract-test wymaga AI=mock (scenariusze przez X-Demo-Scenario)'); process.exit(2); }
const clock = await fetch(`${API}/api/dev/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"advanceSecs":0}' });
if (clock.status !== 200) { console.error('contract-test wymaga zegara testowego (ENABLE_DEV_CLOCK=1 albo NODE_ENV=test)'); process.exit(2); }

await call(z.array(z.any()), 'GET', '/api/categories');
await expectError('UNAUTHORIZED', 'GET', '/api/me');
await expectError('NOT_FOUND', 'GET', '/api/listings/nie-ma');
await expectError('VALIDATION', 'POST', '/api/listings', { token: (await login('ania@demo.pl')).token, body: { title: 'x' } });
const ctx: Ctx = { seller: await login('ania@demo.pl'), buyer: await login('bartek@demo.pl'), stranger: await login('celina@demo.pl') };

const cases: [string, () => Promise<Deal>][] = [
  ['confirm_receipt', () => confirmReceipt(ctx)],
  ['ok', () => disputeSellerWins(ctx, 'ok')],
  ['defect', () => defect(ctx)],
  ['swap', () => disputeSellerWins(ctx, 'swap')],
  ['invalid_recording', () => disputeSellerWins(ctx, 'invalid_recording')],
  ['ship_timeout', () => shipTimeout(ctx)],
  ['unbox_return_timeouts', () => unboxAndReturnTimeouts(ctx)],
  ['invalid_report', () => invalidReport(ctx, 'invalid_report')],
  ['wrong_evidence', () => invalidReport(ctx, 'wrong_evidence')],
  ['ai_down', () => invalidReport(ctx, 'ai_down')],
  ['cancel_listing', () => cancelListing(ctx)],
];

let failed = 0;
for (const [name, run] of cases) {
  if (only && !only.includes(name)) continue;
  const t0 = Date.now();
  try {
    const d = await run();
    console.log(`  ✓ ${name.padEnd(22)} ${d.status}${d.closeReason ? `/${d.closeReason}` : ''}  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name.padEnd(22)} ${(e as Error).message}`);
  }
}
console.log(failed ? `\n${failed} nieudanych` : '\nWszystko zielone');
process.exit(failed ? 1 : 0);
