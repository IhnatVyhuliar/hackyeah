// Księga płatności: niezmienniki sum i odporność na równoległe żądania.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_START_BALANCE_MINOR, TIMEOUTS_DEMO } from '@unbox/shared';
import { advance, as, type Backend, blob, codeOf, listing, shipped, startBackend } from './harness';

let be: Backend;
let seller: Awaited<ReturnType<typeof as>>, buyer: typeof seller, stranger: typeof seller;
const parties = () => [seller, buyer, stranger];

/** Suma wszystkich środków w systemie: salda + środki zabezpieczone w aktywnych zakupach. */
async function totals() {
  const ws = await Promise.all(parties().map((p) => p.auth.wallet()));
  const deals = await buyer.deals.list('buyer').then(async (b) => [...b, ...(await stranger.deals.list('buyer'))]);
  const securedSum = deals.filter((d) => d.payment.status === 'secured').reduce((s, d) => s + d.payment.amountMinor, 0);
  return {
    total: ws.reduce((s, w) => s + w.balanceMinor + w.heldMinor, 0),
    held: ws.reduce((s, w) => s + w.heldMinor, 0),
    securedSum,
    negative: ws.some((w) => w.balanceMinor < 0),
  };
}
const START = 3 * DEMO_START_BALANCE_MINOR;
async function expectInvariant() {
  const t = await totals();
  expect(t.total).toBe(START);             // środki nie znikają i nie powstają
  expect(t.held).toBe(t.securedSum);       // held = suma cen aktywnych zakupów
  expect(t.negative).toBe(false);
}

beforeAll(async () => {
  be = await startBackend();
  [seller, buyer, stranger] = await Promise.all(['ania@demo.pl', 'bartek@demo.pl', 'celina@demo.pl'].map((e) => as(be.url, e)));
});
afterAll(() => be?.stop());

describe('księga płatności', () => {
  it('pełne przepływy: suma środków stała, held = aktywne zakupy, zakup blokuje dokładnie cenę', async () => {
    await expectInvariant();
    const b0 = (await buyer.auth.wallet()).balanceMinor;

    // happy path
    const a = await shipped(seller, buyer, 1_234);
    expect((await buyer.auth.wallet())).toMatchObject({ balanceMinor: b0 - 1_234, heldMinor: 1_234 });
    await expectInvariant();
    await buyer.flows.acceptDeal(a.deal, a.payload);
    await expectInvariant();

    // spór → BUYER → zwrot → Refunded
    const b = await shipped(seller, buyer, 2_000);
    await buyer.flows.openDispute(b.deal, { scannedPayload: b.payload, unboxingVideo: { source: blob('video/mp4') }, demoScenario: 'defect',
      complaint: { category: 'damaged', description: 'plama' } });
    await expectInvariant();
    const rr = await buyer.flows.waitForDeal(b.deal.id, (d) => d.status === 'ReturnRequested', { intervalMs: 50, timeoutMs: 10_000 });
    const ret = buyer.flows.prepareReturnQr(rr.id);
    const returning = await buyer.flows.markReturned(rr.id, { returnQrCommitment: ret.commitment, returnVideo: { source: blob('video/mp4') }, returnTrackingNumber: 'INP2' });
    await seller.flows.confirmReturn(returning, ret.payload);
    await expectInvariant();

    // timeout nadania → zwrot
    const l = await listing(seller, 777);
    await stranger.flows.purchaseListing(l.id);
    await expectInvariant();
    await advance(be.url, TIMEOUTS_DEMO.Paid);
    const [d] = (await stranger.deals.list('buyer')).filter((x) => x.id === l.id);
    expect(d).toMatchObject({ status: 'Refunded', payment: { status: 'refunded' } });
    await expectInvariant();

    expect((await buyer.auth.wallet()).balanceMinor).toBe(b0 - 1_234);   // zapłacił tylko za przyjęty przedmiot
  });

  it('nie da się wydać więcej, niż jest na saldzie (także równolegle)', async () => {
    const free = (await stranger.auth.wallet()).balanceMinor;
    const big = Math.floor(free * 0.6);
    const [l1, l2] = [await listing(seller, big), await listing(seller, big)];
    const r = await Promise.all([codeOf(stranger.listings.purchase(l1.id)), codeOf(stranger.listings.purchase(l2.id))]);
    expect(r.sort()).toEqual(['INSUFFICIENT_FUNDS', 'OK']);
    expect((await stranger.auth.wallet()).balanceMinor).toBe(free - big);
    await expectInvariant();
  });
});

describe('wyścigi', () => {
  it('równoległy zakup tego samego ogłoszenia: dokładnie jeden wygrywa', async () => {
    const l = await listing(seller, 500);
    const [bw, sw] = [(await buyer.auth.wallet()).balanceMinor, (await stranger.auth.wallet()).balanceMinor];
    const r = await Promise.all([codeOf(buyer.listings.purchase(l.id)), codeOf(stranger.listings.purchase(l.id)),
                                 codeOf(buyer.listings.purchase(l.id))]);
    expect(r.filter((x) => x === 'OK')).toHaveLength(1);
    expect(r.filter((x) => x !== 'OK').every((x) => x === 'INVALID_STATE')).toBe(true);
    const spent = (bw - (await buyer.auth.wallet()).balanceMinor) + (sw - (await stranger.auth.wallet()).balanceMinor);
    expect(spent).toBe(500);
    await expectInvariant();
  });

  it('równoległe rozliczenia: accept×2, settle×2, timeout vs akcja, confirm-return×2 — jedno rozliczenie', async () => {
    const s0 = (await seller.auth.wallet()).balanceMinor;

    const a = await shipped(seller, buyer, 300);
    const acc = await Promise.all([codeOf(buyer.flows.acceptDeal(a.deal, a.payload)), codeOf(buyer.flows.acceptDeal(a.deal, a.payload))]);
    expect(acc.sort()).toEqual(['INVALID_STATE', 'OK']);

    const b = await shipped(seller, buyer, 400);
    await advance(be.url, TIMEOUTS_DEMO.Shipped);
    const st = await Promise.all([codeOf(buyer.deals.settle(b.deal.id)), codeOf(seller.deals.settle(b.deal.id))]);
    expect(st.sort()).toEqual(['INVALID_STATE', 'OK']);

    // termin minął dokładnie teraz: ręczne „Wszystko OK” i domknięcie po terminie naraz → jeden wynik
    const c = await shipped(seller, buyer, 500);
    await advance(be.url, TIMEOUTS_DEMO.Shipped);
    const race = await Promise.all([codeOf(buyer.flows.acceptDeal(c.deal, c.payload)), codeOf(seller.deals.settle(c.deal.id))]);
    expect(race.filter((x) => x === 'OK')).toHaveLength(1);
    const cd = await buyer.deals.get(c.deal.id);
    expect(cd).toMatchObject({ status: 'Completed', payment: { status: 'released' } });

    expect((await seller.auth.wallet()).balanceMinor).toBe(s0 + 300 + 400 + 500);   // każda wypłata dokładnie raz

    const d = await shipped(seller, buyer, 600);
    await buyer.flows.openDispute(d.deal, { scannedPayload: d.payload, unboxingVideo: { source: blob('video/mp4') }, demoScenario: 'defect',
      complaint: { category: 'damaged', description: 'plama' } });
    const rr = await buyer.flows.waitForDeal(d.deal.id, (x) => x.status === 'ReturnRequested', { intervalMs: 50, timeoutMs: 10_000 });
    const ret = buyer.flows.prepareReturnQr(rr.id);
    const returning = await buyer.flows.markReturned(rr.id, { returnQrCommitment: ret.commitment, returnVideo: { source: blob('video/mp4') }, returnTrackingNumber: 'INP3' });
    const b0 = (await buyer.auth.wallet()).balanceMinor;
    const cr = await Promise.all([codeOf(seller.flows.confirmReturn(returning, ret.payload)), codeOf(seller.flows.confirmReturn(returning, ret.payload))]);
    expect(cr.sort()).toEqual(['INVALID_STATE', 'OK']);
    expect((await buyer.auth.wallet()).balanceMinor).toBe(b0 + 600);                // zwrot dokładnie raz
    await expectInvariant();
  });
});
