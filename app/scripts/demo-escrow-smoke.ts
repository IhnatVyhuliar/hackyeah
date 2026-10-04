// DemoEscrow against a running PAYMENTS=demo server: the whole state machine through the Escrow seam.
// Needs AI=mock, ENABLE_DEV_CLOCK=1 and a fresh seed (unbox-server seed-reset). From the repo root:
//   EXPO_PUBLIC_API_URL=http://localhost:4100 node --import tsx app/scripts/demo-escrow-smoke.ts
import assert from 'node:assert/strict';
import { isEscrowError, type Deal, type DealKey, type Escrow, type Listing } from '@unbox/shared';
import { createApi, type Api } from '../src/api/client';
import { createDemoEscrow } from '../src/escrow/demo';

const URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4100';

async function as(email: string, scenario?: string): Promise<{ api: Api; escrow: Escrow }> {
  const a = createApi(URL);
  const r = await a.post<{ token: string }>('/api/auth/login', { email, password: 'demo1234' });
  a.setToken(r.token);
  return { api: a, escrow: createDemoEscrow(a, { scenario }) };
}
const video = async (a: Api) =>
  (await a.uploadBlob(new Blob([crypto.getRandomValues(new Uint8Array(64))], { type: 'video/mp4' }), 'v.mp4')).sha256;
const status = async (a: Api, id: string) => (await a.get<Deal>(`/api/deals/${id}`)).status;
const rejectsWith = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => isEscrowError(e) && e.code === code);
async function waitFor(a: Api, id: string, want: string) {
  for (let i = 0; i < 30; i++) {
    if ((await status(a, id)) === want) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${id}: never reached ${want} (now ${await status(a, id)})`);
}

async function main() {
  const ania = await as('ania@demo.pl');
  const bartek = await as('bartek@demo.pl');

  // 1. Happy path: purchase → ship → accept.
  const kurtka: DealKey = { id: 'l-kurtka-levis', deal: null };
  await bartek.escrow.purchase(kurtka);
  const card = await ania.escrow.newQrCard('ship', kurtka);
  await ania.escrow.markShipped(kurtka, { qrCommitment: card.commitment, packingVideoSha256: await video(ania.api), trackingNumber: 'INP1' });
  await bartek.escrow.acceptDelivery(kurtka, card.payload);
  assert.equal(await status(bartek.api, kurtka.id), 'Completed');
  console.log('ok 1 happy path');

  // 2. Review Focus 4: a repeated accept is a status race, not a second payout.
  await rejectsWith(bartek.escrow.acceptDelivery(kurtka, card.payload), 'InvalidStatus');
  console.log('ok 2 second accept → InvalidStatus');

  // 3. The return card is not the shipping card.
  const sukienka: DealKey = { id: 'l-sukienka-zara', deal: null };
  const disputer = await as('bartek@demo.pl', 'defect');
  await disputer.escrow.purchase(sukienka);
  const card2 = await ania.escrow.newQrCard('ship', sukienka);
  await ania.escrow.markShipped(sukienka, { qrCommitment: card2.commitment, packingVideoSha256: await video(ania.api), trackingNumber: 'INP2' });
  const wrong = await disputer.escrow.newQrCard('return', sukienka);
  await rejectsWith(disputer.escrow.acceptDelivery(sukienka, wrong.payload), 'QrMismatch');
  assert.equal(await status(bartek.api, sukienka.id), 'Shipped');
  console.log('ok 3 return card in accept → QrMismatch');

  // 4. Dispute (mock AI "defect" → BUYER) → return → refund; without a scenario → SELLER → Completed.
  await disputer.escrow.openDispute(sukienka, { qrPayload: card2.payload, unboxingVideoSha256: await video(disputer.api),
    complaint: { category: 'damaged', description: 'Plama na rękawie' }, complaintSha256: 'ab'.repeat(32) });
  await waitFor(bartek.api, sukienka.id, 'ReturnRequested');
  const ret = await disputer.escrow.newQrCard('return', sukienka);
  await disputer.escrow.markReturned(sukienka, { returnQrCommitment: ret.commitment, returnVideoSha256: await video(disputer.api), trackingNumber: 'RET1' });
  await ania.escrow.confirmReturn(sukienka, ret.payload);
  assert.equal(await status(bartek.api, sukienka.id), 'Refunded');
  const nike: DealKey = { id: 'l-sneakersy-nike', deal: null };
  await bartek.escrow.purchase(nike);
  const card3 = await ania.escrow.newQrCard('ship', nike);
  await ania.escrow.markShipped(nike, { qrCommitment: card3.commitment, packingVideoSha256: await video(ania.api), trackingNumber: 'INP3' });
  await bartek.escrow.openDispute(nike, { qrPayload: card3.payload, unboxingVideoSha256: await video(bartek.api),
    complaint: { category: 'not_as_described', description: 'Inny kolor' }, complaintSha256: 'cd'.repeat(32) });
  await waitFor(bartek.api, nike.id, 'Completed');
  console.log('ok 4 dispute defect → Refunded, no scenario → Completed');

  // 5. Past the deadline: the seller never ships, the buyer gets the money back.
  const l = await ania.api.post<Listing>('/api/listings', { title: 'Czapka testowa', description: 'Smoke', categoryId: 'inne',
    condition: 'dobry', brand: 'b', size: 'M', defects: [], photos: [], priceMinor: 5000 });
  const czapka: DealKey = { id: l.id, deal: null };
  await bartek.escrow.purchase(czapka);
  const before = await bartek.escrow.networkNow();
  await ania.api.post('/api/dev/clock', { advanceSecs: 700 });
  assert.ok((await bartek.escrow.networkNow()) >= before + 700, 'networkNow follows the server dev clock');
  try {
    await bartek.escrow.settleExpired(czapka);
  } catch (e) {
    if (!(isEscrowError(e) && e.code === 'InvalidStatus')) throw e;   // the server sweep may close it first
  }
  await waitFor(bartek.api, czapka.id, 'Refunded');
  console.log('ok 5 after the deadline → Refunded');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
