import { describe, expect, it } from 'vitest';
import { TIMEOUTS_DEMO } from './constants';
import { DealError, transition, availableActions, type DealAction } from './dealMachine';
import {
  canonicalJson, createQr, decide, formatPln, parsePln, parseQrPayload, qrPayload, returnCommitment, shipCommitment, verifyQr,
} from './helpers';
import type { Deal, OracleReport } from './types';
import { EscrowError, isEscrowError } from './escrow';
import { ApiErrorSchema, ListingSchema, OnChainDealSchema, UserSchema, WalletSchema } from './schemas';

// Wektory QR (policzone niezależnie przez node:crypto): deal = "d-kurtka-levis", secret = 32 × 0xab.
const DEAL = 'd-kurtka-levis';
const SECRET = 'ab'.repeat(32);

describe('QR', () => {
  it('commitmenty i payload', () => {
    expect(shipCommitment(DEAL, SECRET)).toBe('a080df4ce1bcc2666d4739386680f9800d7ddf174132315fdceea3926ce7f8d3');
    expect(returnCommitment(DEAL, SECRET)).toBe('b7b9609665ba619c3f68f4771997f96fc624a6b83b547655cf46e80152d93bd0');
    expect(qrPayload('ship', DEAL, SECRET)).toBe(`UNBOX1:${DEAL}:${SECRET}`);
    expect(parseQrPayload(qrPayload('return', DEAL, SECRET))).toEqual({ kind: 'return', dealId: DEAL, secret: SECRET });
    expect(parseQrPayload('UNBOX1:x:zz')).toBeNull();
    expect(() => shipCommitment(DEAL, 'AB')).toThrow();
  });
  it('round-trip: generate → encode → parse → verify', () => {
    for (const kind of ['ship', 'return'] as const) {
      const qr = createQr(kind, DEAL);
      const parsed = parseQrPayload(qr.payload);
      expect(parsed).toEqual({ kind, dealId: DEAL, secret: qr.secret });
      expect(verifyQr(qr.payload, { kind, dealId: DEAL, commitment: qr.commitment })).toEqual({ ok: true, secret: qr.secret });
      // ten sam sekret nie przejdzie jako kod drugiego rodzaju, innej transakcji ani innego commitmentu
      expect(verifyQr(qr.payload, { kind: kind === 'ship' ? 'return' : 'ship', dealId: DEAL, commitment: qr.commitment }).ok).toBe(false);
      expect(verifyQr(qr.payload, { kind, dealId: 'd-inny', commitment: qr.commitment }).ok).toBe(false);
      expect(verifyQr(qr.payload, { kind, dealId: DEAL, commitment: createQr(kind, DEAL).commitment }).ok).toBe(false);
    }
    const ship = createQr('ship', DEAL);
    const ret = returnCommitment(DEAL, ship.secret);
    expect(ret).not.toBe(ship.commitment);           // separacja domen: sekret wysyłki ≠ commitment zwrotu
    expect(verifyQr('nie-qr', { kind: 'ship', dealId: DEAL, commitment: ship.commitment }).ok).toBe(false);
  });
  it('canonicalJson sortuje klucze rekurencyjnie', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: 'ł' } })).toBe('{"a":{"c":"ł","d":[2,{"x":0,"y":1}]},"b":1}');
  });
  it('kwoty bez floatów', () => {
    expect(parsePln('120,5')).toBe(12050);
    expect(parsePln('0.07 zł')).toBe(7);
    expect(parsePln('12,345')).toBeNull();
    expect(formatPln(12050)).toBe('120,50 zł');
  });
});

const goodReport: OracleReport = {
  buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: 'good', notes: '' },
  seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: 'good', notes: '' },
  package_matches_shipping_recording: true, item_matches_listing: true,
  undisclosed_damage: { present: false, description: '', timestamps: [] }, reasoning: '',
};

describe('decide (CLAUDE.md §5)', () => {
  it('cztery przypadki', () => {
    expect(decide(goodReport)).toBe('SELLER');
    expect(decide({ ...goodReport, undisclosed_damage: { present: true, description: 'plama', timestamps: ['0:14'] } })).toBe('BUYER');
    expect(decide({ ...goodReport, item_matches_listing: false })).toBe('BUYER');
    expect(decide({ ...goodReport, package_matches_shipping_recording: false, item_matches_listing: false })).toBe('SELLER');
    expect(decide({ ...goodReport, buyer_recording: { ...goodReport.buyer_recording, continuous: false },
                    undisclosed_damage: { present: true, description: '', timestamps: [] } })).toBe('SELLER');
    // słabe nagranie sprzedającego wyłącza sprawdzenie zgodności paczki
    expect(decide({ ...goodReport, seller_recording: { ...goodReport.seller_recording, quality: 'poor' },
                    package_matches_shipping_recording: false, item_matches_listing: false })).toBe('BUYER');
  });
});

const T0 = 1_000_000;
const paid: Deal = {
  id: DEAL, listing: { v: 1, title: 'Kurtka', description: '', brand: '', size: 'M', condition: 'dobry', defects: [], photos: [],
    priceMinor: 12000, currency: 'PLN' },
  listingHash: '0'.repeat(64), sellerId: 'S', seller: { id: 'S', name: 'S' }, buyerId: 'B', buyer: { id: 'B', name: 'B' },
  status: 'Paid', statusChangedAt: T0, deadlineAt: T0 + TIMEOUTS_DEMO.Paid,
  payment: { status: 'secured', amountMinor: 12000, currency: 'PLN', securedAt: T0, settledAt: null },
  qrCommitment: null, packingVideoSha256: null, trackingNumber: null, unboxingVideoSha256: null, complaint: null,
  complaintHash: null, analysis: null, verdict: null, returnQrCommitment: null, returnVideoSha256: null,
  returnTrackingNumber: null, closeReason: null, timeline: [], createdAt: T0,
};
const H = 'c'.repeat(64);
const run = (d: Deal, a: DealAction, now: number) => transition(d, a, now, TIMEOUTS_DEMO);
const ship: DealAction = { type: 'ship', actorId: 'S', qrCommitment: shipCommitment(DEAL, SECRET), packingVideoSha256: H, trackingNumber: 'INP123' };
const complaint = { v: 1 as const, category: 'damaged' as const, description: 'plama', created_at: T0 };

describe('maszyna stanów', () => {
  it('happy path: ship → accept (release)', () => {
    const s = run(paid, ship, T0 + 1).deal;
    expect(s).toMatchObject({ status: 'Shipped', deadlineAt: T0 + 1 + TIMEOUTS_DEMO.Shipped });
    const r = run(s, { type: 'accept', actorId: 'B', qrSecret: SECRET }, T0 + 2);
    expect(r.effect).toBe('release');
    expect(r.deal).toMatchObject({ status: 'Completed', closeReason: 'accepted', deadlineAt: null, payment: { status: 'released' } });
  });

  it('spór → BUYER → zwrot → potwierdzenie (refund)', () => {
    let d = run(paid, ship, T0 + 1).deal;
    d = run(d, { type: 'dispute', actorId: 'B', qrSecret: SECRET, unboxingVideoSha256: H, complaint, complaintHash: H }, T0 + 2).deal;
    expect(d.status).toBe('Disputed');
    d = run(d, { type: 'resolve', verdict: 'BUYER' }, T0 + 3).deal;
    expect(d).toMatchObject({ status: 'ReturnRequested', verdict: 'BUYER', payment: { status: 'secured' } });
    d = run(d, { type: 'return', actorId: 'B', returnQrCommitment: returnCommitment(DEAL, SECRET), returnVideoSha256: H, returnTrackingNumber: 'INP9' }, T0 + 4).deal;
    const r = run(d, { type: 'confirm_return', actorId: 'S', returnQrSecret: SECRET }, T0 + 5);
    expect(r.deal).toMatchObject({ status: 'Refunded', closeReason: 'return_confirmed', payment: { status: 'refunded' } });
  });

  it('negatywne: rola, zły QR, termin, stan, podwójne rozliczenie', () => {
    const code = (f: () => unknown) => { try { f(); } catch (e) { return (e as DealError).code; } return 'OK'; };
    expect(code(() => run(paid, { ...ship, actorId: 'B' } as DealAction, T0))).toBe('FORBIDDEN');
    expect(code(() => run(paid, ship, T0 + TIMEOUTS_DEMO.Paid))).toBe('DEADLINE_PASSED');   // granica: now >= deadline
    const s = run(paid, ship, T0).deal;
    expect(code(() => run(s, { type: 'accept', actorId: 'B', qrSecret: 'ff'.repeat(32) }, T0))).toBe('QR_MISMATCH');
    expect(code(() => run(s, { type: 'accept', actorId: 'X', qrSecret: SECRET }, T0))).toBe('FORBIDDEN');
    expect(code(() => run(s, { type: 'resolve', verdict: 'SELLER' }, T0))).toBe('INVALID_STATE');
    expect(code(() => run(s, { type: 'expire' }, T0 + TIMEOUTS_DEMO.Shipped - 1))).toBe('DEADLINE_NOT_REACHED');
    const done = run(s, { type: 'accept', actorId: 'B', qrSecret: SECRET }, T0).deal;
    expect(code(() => run(done, { type: 'accept', actorId: 'B', qrSecret: SECRET }, T0))).toBe('INVALID_STATE');
    expect(code(() => run(done, { type: 'expire' }, T0 + 10 ** 6))).toBe('INVALID_STATE');
    // nawet gdyby status był niespójny, płatności nie da się rozliczyć drugi raz
    expect(code(() => run({ ...done, status: 'Shipped', deadlineAt: T0 }, { type: 'expire' }, T0))).toBe('INVALID_STATE');
  });

  it('timeouty (settle_expired)', () => {
    const exp = (d: Deal) => run(d, { type: 'expire' }, d.deadlineAt!).deal;
    expect(exp(paid)).toMatchObject({ status: 'Refunded', closeReason: 'ship_timeout', payment: { status: 'refunded' } });
    const s = run(paid, ship, T0).deal;
    expect(exp(s)).toMatchObject({ status: 'Completed', closeReason: 'unbox_timeout', payment: { status: 'released' } });
    const disp = run(s, { type: 'dispute', actorId: 'B', qrSecret: SECRET, unboxingVideoSha256: H, complaint, complaintHash: H }, T0).deal;
    expect(exp(disp)).toMatchObject({ status: 'ReturnRequested', payment: { status: 'secured' } });
    expect(exp(exp(disp))).toMatchObject({ status: 'Completed', closeReason: 'return_ship_timeout' });
    expect(availableActions(s, 'B', T0)).toEqual(['accept', 'dispute']);
    expect(availableActions(s, 'S', s.deadlineAt!)).toEqual(['expire']);
  });
});

describe('EscrowError', () => {
  it('niesie kod i polski komunikat, rozpoznawalny bez instanceof', () => {
    const e = new EscrowError('QrMismatch', 'Kod z karty nie pasuje');
    expect([e.code, e.message, e.name]).toEqual(['QrMismatch', 'Kod z karty nie pasuje', 'EscrowError']);
    expect(isEscrowError(e)).toBe(true);
    expect(isEscrowError({ name: 'EscrowError', code: 'Network', message: 'x' })).toBe(true);
    expect(isEscrowError(new Error('x'))).toBe(false);
  });
});

describe('kształt API w trybie solana', () => {
  const onchain = { deal: '4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw', dealId: 1, sellerWallet: 'x', listingHash: 'ab'.repeat(32),
    metadataUri: 'http://x/api/listings/l-1/metadata.json', published: true };
  const listing = { id: 'l-1', sellerId: 'u-ania', seller: { id: 'u-ania', name: 'Ania' }, title: 't', description: 'd',
    categoryId: 'c', condition: 'dobry', brand: 'b', size: 'M', defects: [], photos: [], priceMinor: 60_000_000,
    currency: 'SOL', status: 'Listed', createdAt: 1, updatedAt: 1 };

  it('ogłoszenie w SOL z polem onchain, a bez onchain dalej przechodzi', () => {
    expect(ListingSchema.parse({ ...listing, onchain }).onchain?.published).toBe(true);
    expect(ListingSchema.parse(listing).onchain).toBeUndefined();
  });
  it('portfel z adresem i użytkownik z podpiętym portfelem', () => {
    expect(WalletSchema.parse({ balanceMinor: 1, currency: 'SOL', heldMinor: 0, ledger: [], address: 'x' }).address).toBe('x');
    expect(UserSchema.parse({ id: 'u', email: 'e', name: 'n', createdAt: 1, walletAddress: 'x' }).walletAddress).toBe('x');
  });
  it('transakcja z sygnaturami z łańcucha i błąd UPSTREAM', () => {
    const tx = { status: 'Paid', at: 2, signature: 'sig', explorerUrl: 'https://explorer.solana.com/tx/sig?cluster=devnet' };
    expect(OnChainDealSchema.parse({ deal: 'd', sellerWallet: 's', buyerWallet: 'b', priceLamports: 1, transactions: [tx] })
      .transactions[0].signature).toBe('sig');
    expect(ApiErrorSchema.parse({ error: { code: 'UPSTREAM', message: 'RPC' } }).error.code).toBe('UPSTREAM');
  });
});
