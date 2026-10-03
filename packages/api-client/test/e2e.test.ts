// E2E przez @unbox/api-client na prawdziwym backendzie (AI=mock). Tak samo zrobi to aplikacja.
import { randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, inject, it } from 'vitest';
import { STATUS_LABELS_PL, type Deal } from '@unbox/shared';
import { ApiClientError, createUnboxApi, type UnboxApi } from '../src';

const baseUrl = inject('apiUrl');
const mk = () => createUnboxApi({ baseUrl });
const blob = (type: string) => ({ kind: 'blob' as const, blob: new Blob([randomBytes(16 * 1024)], { type }), name: type.startsWith('video') ? 'v.mp4' : 'p.jpg' });
const video = () => ({ source: blob('video/mp4') });
const codeOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { return (e as ApiClientError).code; } return 'OK'; };

let seller: UnboxApi, buyer: UnboxApi, stranger: UnboxApi;
let sellerId: string, buyerId: string;

beforeAll(async () => {
  seller = mk(); buyer = mk(); stranger = mk();
  sellerId = (await seller.auth.login({ email: 'ania@demo.pl', password: 'demo1234' })).id;
  buyerId = (await buyer.auth.login({ email: 'bartek@demo.pl', password: 'demo1234' })).id;
  await stranger.auth.register({ email: `obcy-${Date.now()}@demo.pl`, password: 'haslo123', name: 'Obcy' });
});

async function newListing(price = 4_500) {
  const photo = await seller.media.upload(blob('image/jpeg'));
  return seller.listings.create({ title: 'Bluza Adidas', description: 'Ciepła bluza', categoryId: 'odziez-meska', condition: 'dobry',
    brand: 'Adidas', size: 'L', defects: [], photos: [{ url: photo.url, sha256: photo.sha256 }], priceMinor: price });
}

async function shipped() {
  const l = await newListing();
  const deal = await buyer.flows.purchaseListing(l.id);
  const qr = seller.flows.prepareShippingQr(deal.id);                  // karta QR do wydruku i włożenia do paczki
  const d = await seller.flows.shipDeal(deal.id, { qrCommitment: qr.commitment, packingVideo: video(), trackingNumber: 'INP777' });
  return { listing: l, deal: d, scannedPayload: qr.payload };          // kupujący zeskanuje ten payload po otwarciu
}

describe('klient API na żywym backendzie', () => {
  it('logowanie, lista i szczegóły ogłoszenia, kategorie', async () => {
    expect((await buyer.auth.me()).id).toBe(buyerId);
    const list = await buyer.listings.list();
    expect(list.length).toBeGreaterThan(0);
    expect((await buyer.listings.get(list[0].id)).id).toBe(list[0].id);
    expect((await buyer.listings.categories()).length).toBe(6);
    expect(await codeOf(mk().auth.login({ email: 'ania@demo.pl', password: 'zle' }))).toBe('UNAUTHORIZED');
    expect(await codeOf(buyer.listings.get('nie-ma'))).toBe('NOT_FOUND');
  });

  it('zakup, szczegóły transakcji, niedozwolona akcja → 409/403', async () => {
    const l = await newListing();
    const deal = await buyer.flows.purchaseListing(l.id);
    expect(deal).toMatchObject({ status: 'Paid', payment: { status: 'secured', amountMinor: 4_500 } });
    const d = await buyer.flows.fetchDeal(deal.id);
    expect(STATUS_LABELS_PL[d.status]).toBe('Opłacone – czeka na wysyłkę');
    expect(buyer.flows.actionsFor(d, buyerId)).toEqual([]);
    expect(seller.flows.actionsFor(d, sellerId)).toEqual(['ship']);
    expect(await codeOf(buyer.deals.accept(deal.id, { qrSecret: 'ab'.repeat(32) }))).toBe('INVALID_STATE');   // 409
    expect(await codeOf(buyer.deals.settle(deal.id))).toBe('DEADLINE_NOT_REACHED');                           // 409
    expect(await codeOf(stranger.deals.get(deal.id))).toBe('FORBIDDEN');                                       // 403
    expect(await codeOf(buyer.listings.purchase(l.id))).toBe('INVALID_STATE');                                 // już kupione
  });

  it('smoke: wystaw → kup → nadaj → „Wszystko OK” → Completed, salda poprawne', async () => {
    const [s0, b0] = [(await seller.auth.wallet()).balanceMinor, (await buyer.auth.wallet()).balanceMinor];
    const { deal, scannedPayload } = await shipped();
    const w = await buyer.auth.wallet();
    expect(w.balanceMinor).toBe(b0 - 4_500);
    expect(w.heldMinor).toBeGreaterThanOrEqual(4_500);
    expect(buyer.flows.actionsFor(deal, buyerId)).toEqual(['accept', 'dispute']);
    // QR z innej transakcji odrzuca już klient (po polsku), zanim cokolwiek wyśle
    const other = seller.flows.prepareShippingQr('inna-transakcja');
    await expect(buyer.flows.acceptDeal(deal, other.payload)).rejects.toThrow('Kod QR należy do innej transakcji');
    const done = await buyer.flows.acceptDeal(deal, scannedPayload);
    expect(done).toMatchObject({ status: 'Completed', closeReason: 'accepted', payment: { status: 'released' } });
    expect((await seller.auth.wallet()).balanceMinor).toBe(s0 + 4_500);
    expect((await buyer.auth.wallet()).balanceMinor).toBe(b0 - 4_500);
    expect(await codeOf(buyer.flows.acceptDeal(done, scannedPayload))).toBe('INVALID_STATE');
    const mine = await buyer.flows.fetchDeals('buyer');
    expect(mine.some((x) => x.id === deal.id && x.status === 'Completed')).toBe(true);
  });

  it('spór: reklamacja → AI (mock) → BUYER → zwrot → potwierdzenie → Refunded', async () => {
    const b0 = (await buyer.auth.wallet()).balanceMinor;
    const { deal, scannedPayload } = await shipped();
    let d: Deal = await buyer.flows.openDispute(deal, {
      scannedPayload, unboxingVideo: video(), demoScenario: 'defect',
      complaint: { category: 'damaged', description: 'Plama na rękawie' },
    });
    expect(d.status).toBe('Disputed');
    d = await buyer.flows.waitForDeal(deal.id, (x) => x.status !== 'Disputed', { intervalMs: 200, timeoutMs: 20_000 });
    expect(d).toMatchObject({ status: 'ReturnRequested', verdict: 'BUYER', analysis: { status: 'done', verdict: 'BUYER' } });
    expect(d.analysis!.report!.undisclosed_damage.present).toBe(true);
    expect(buyer.flows.actionsFor(d, buyerId)).toEqual(['return']);

    const ret = buyer.flows.prepareReturnQr(deal.id);
    d = await buyer.flows.markReturned(deal.id, { returnQrCommitment: ret.commitment, returnVideo: video(), returnTrackingNumber: 'INP888' });
    expect(d.status).toBe('Returning');
    await expect(seller.flows.confirmReturn(d, scannedPayload)).rejects.toThrow('To kod wysyłki, a nie zwrotu');
    d = await seller.flows.confirmReturn(d, ret.payload);
    expect(d).toMatchObject({ status: 'Refunded', closeReason: 'return_confirmed', payment: { status: 'refunded' } });
    expect((await buyer.auth.wallet()).balanceMinor).toBe(b0);
  });

  it('spór rozstrzygnięty dla sprzedającego (AI mock „ok”) → Completed', async () => {
    const { deal, scannedPayload } = await shipped();
    await buyer.flows.openDispute(deal, { scannedPayload, unboxingVideo: video(), complaint: { category: 'other', description: 'Nie podoba mi się' } });
    const d = await buyer.flows.waitForDeal(deal.id, (x) => x.status !== 'Disputed', { intervalMs: 200, timeoutMs: 20_000 });
    expect(d).toMatchObject({ status: 'Completed', verdict: 'SELLER', closeReason: 'verdict_seller', payment: { status: 'released' } });
  });
});
