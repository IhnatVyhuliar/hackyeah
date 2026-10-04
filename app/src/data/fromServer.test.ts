import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Deal, Listing, User } from '@unbox/shared';
import { canBuy, fromDeal, fromListing, money, parsePrice, toUnits } from './fromServer';

const listing: Listing = { id: 'l-kurtka-levis', sellerId: 'u-ania', seller: { id: 'u-ania', name: 'Ania' }, title: 'Kurtka',
  description: 'Opis', categoryId: 'c-kurtki', condition: 'jak_nowy', brand: "Levi's", size: 'M', defects: ['Przetarcie'],
  photos: [{ url: 'http://x/media/aa', sha256: 'aa'.repeat(32) }], priceMinor: 60_000_000, currency: 'SOL', status: 'Listed',
  createdAt: 100, updatedAt: 100 };

const deal = (o: Partial<Deal> & Record<string, unknown>) => ({ id: 'l-kurtka-levis', listing: { ...listing, v: 1 }, listingHash: 'ab'.repeat(32),
  sellerId: 'u-ania', seller: { id: 'u-ania', name: 'Ania' }, buyerId: 'u-bartek', buyer: { id: 'u-bartek', name: 'Bartek' },
  status: 'Paid', statusChangedAt: 200, deadlineAt: 800,
  payment: { status: 'secured', amountMinor: 60_000_000, currency: 'SOL', securedAt: 200, settledAt: null },
  qrCommitment: null, packingVideoSha256: null, trackingNumber: null, unboxingVideoSha256: null, complaint: null, complaintHash: null,
  analysis: null, verdict: null, returnQrCommitment: null, returnVideoSha256: null, returnTrackingNumber: null, closeReason: null,
  timeline: [{ at: 200, type: 'paid', label: 'Opłacone' }], createdAt: 200, ...o }) as unknown as Deal;

test('listing maps to a Listed item priced in SOL', () => {
  const it = fromListing(listing, { 'c-kurtki': 'Kurtki' });
  assert.deepEqual([it.status, it.price, it.cond, it.cat, it.flaws, it.key, it.photos], ['Listed', 0.06, 'Bardzo dobry', 'Kurtki', ['Przetarcie'],
    { id: 'l-kurtka-levis', deal: null }, ['http://x/media/aa']]);
  assert.equal(toUnits(12_345, 'PLN'), 123.45);
});

test('a listing is published in demo mode; in solana mode only once the Deal account exists', () => {
  assert.equal(fromListing({ ...listing, currency: 'PLN' }, {}).published, true);
  assert.equal(fromListing(listing, {}).published, false);
  const onchain = { deal: 'PDA1', dealId: 1, sellerWallet: 'SW', listingHash: 'ab'.repeat(32), metadataUri: 'u', published: true };
  const it = fromListing({ ...listing, onchain }, {});
  assert.deepEqual([it.published, it.pda, it.key.deal, it.sellerWallet], [true, 'PDA1', 'PDA1', 'SW']);
});

test('deal keeps the server deadline, explorer links per status and the PDA', () => {
  const d = deal({ status: 'ReturnRequested', statusChangedAt: 500, deadlineAt: 1100, trackingNumber: 'INP1',
    timeline: [{ at: 200, type: 'paid', label: 'Opłacone' }, { at: 500, type: 'return_requested', label: 'x' }],
    onchain: { deal: 'PDA111', sellerWallet: 's', buyerWallet: 'b', priceLamports: 60_000_000,
      transactions: [{ status: 'Paid', at: 200, signature: 'sig-paid', explorerUrl: 'https://explorer.solana.com/tx/sig-paid?cluster=devnet' }] } });
  const it = fromDeal(d, {});
  assert.deepEqual([it.deadlineAt, it.key, it.buyer, it.buyerName, it.tracking], [1100, { id: 'l-kurtka-levis', deal: 'PDA111' }, 'u-bartek', 'Bartek', 'INP1']);
  assert.deepEqual(it.events.map((e) => [e.st, e.sig, e.href]),
    [['Listed', null, null], ['Paid', 'sig-paid', 'https://explorer.solana.com/tx/sig-paid?cluster=devnet'], ['ReturnRequested', null, null]]);
  assert.equal(it.noVerdict, true);   // ReturnRequested without a verdict = the oracle stayed silent
});

test('demo-mode timeline types map to statuses, including expiries', () => {
  const d = deal({ status: 'Refunded', currency: 'PLN', timeline: [{ at: 1, type: 'paid', label: 'a' }, { at: 2, type: 'expired_Paid', label: 'b' }] });
  assert.deepEqual(fromDeal(d, {}).events.map((e) => e.st), ['Listed', 'Paid', 'Refunded']);
  const d2 = deal({ status: 'Completed', timeline: [{ at: 1, type: 'paid', label: '' }, { at: 2, type: 'shipped', label: '' }, { at: 3, type: 'accepted', label: '' }] });
  assert.deepEqual(fromDeal(d2, {}).events.map((e) => e.st), ['Listed', 'Paid', 'Shipped', 'Completed']);
  const d3 = deal({ status: 'ReturnRequested', verdict: 'BUYER', timeline: [{ at: 1, type: 'disputed', label: '' }, { at: 2, type: 'resolved_buyer', label: '' }] });
  const it3 = fromDeal(d3, {});
  assert.deepEqual([it3.events.map((e) => e.st), it3.verdict, it3.noVerdict], [['Listed', 'Disputed', 'ReturnRequested'], 'Buyer', false]);
});

test('money and price parsing per currency', () => {
  assert.equal(money(0.06, 'SOL'), '0.060 SOL');
  assert.equal(money(120, 'PLN'), '120,00 zł');
  assert.match((parsePrice('0,2', 'SOL') as { error: string }).error, /maks\. 0,1 SOL/);
  assert.deepEqual(parsePrice('0.05', 'SOL'), { minor: 50_000_000 });
  assert.deepEqual(parsePrice('120', 'PLN'), { minor: 12000 });
  assert.ok('error' in parsePrice('abc', 'SOL'));
  assert.ok('error' in parsePrice('0', 'SOL'));
});

test('Review Focus 5: no linked wallet blocks buying in solana mode only', () => {
  const me = { id: 'u-bartek', email: 'b', name: 'B', createdAt: 1 } as User;
  assert.equal(canBuy(me, 'solana').ok, false);
  assert.match(canBuy(me, 'solana').reason, /portfel/i);
  assert.equal(canBuy(me, 'demo').ok, true);
  assert.equal(canBuy({ ...me, walletAddress: 'x' }, 'solana').ok, true);
  const taken = canBuy({ ...me, walletAddress: 'x' }, 'solana', 'Ten adres portfela jest już przypisany do innego konta.');
  assert.deepEqual([taken.ok, taken.reason], [false, 'Ten adres portfela jest już przypisany do innego konta.']);
});
