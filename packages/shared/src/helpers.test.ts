import { describe, expect, it } from 'vitest';
import {
  canonicalJson, deriveStatus, escrowPda, evaluateVerdict, sealHash, sealPayload, shortCode,
  splitPayout, termsHash, timeoutOutcome, uuidToBytes, bytesToUuid, parseSealPayload, type Terms,
} from './helpers';
import { applyAction, FakeChainError } from './fakeChain';
import { DEFAULT_THRESHOLDS, DEFAULT_WINDOWS } from './constants';
import type { Measurements } from './types';

// Wektory z KONTRAKT §6 — muszą przejść też w testach programu (Osoba 2).
const ORDER = '5e115e11-de00-4000-8000-000000000001';
const terms: Terms = {
  listingId: 'l-kurtka-levis', priceLamports: '200000000', sellerWallet: 'SELLERWALLET111',
  thresholds: { minMatchScore: 70, minPackageScore: 60, weightTolG: 150 },
  windows: { shipWindowSecs: 1800, openWindowSecs: 1800 },
  extraTests: ['Pokaż metkę z rozmiarem M'], declaredWeightG: 900,
};

describe('wektory §6', () => {
  it('uuidToBytes', () => {
    expect(Array.from(uuidToBytes(ORDER))).toEqual([94, 17, 94, 17, 222, 0, 64, 0, 128, 0, 0, 0, 0, 0, 0, 1]);
    expect(bytesToUuid(uuidToBytes(ORDER))).toBe(ORDER);
  });
  it('sealHash', () => {
    const p = sealPayload(ORDER, '00112233445566778899aabbccddeeff');
    expect(p).toBe('SELLSOL1|5e115e11-de00-4000-8000-000000000001|00112233445566778899aabbccddeeff');
    expect(sealHash(p)).toBe('5c18f2ae2a29fb45d6d08ba1aea8407e30e573698f7bf5bff76261b70b1014b4');
    expect(parseSealPayload(p)).toEqual({ orderId: ORDER, nonce: '00112233445566778899aabbccddeeff' });
  });
  it('canonicalJson i termsHash', () => {
    expect(canonicalJson(terms)).toBe('{"declaredWeightG":900,"extraTests":["Pokaż metkę z rozmiarem M"],"listingId":"l-kurtka-levis","priceLamports":"200000000","sellerWallet":"SELLERWALLET111","thresholds":{"minMatchScore":70,"minPackageScore":60,"weightTolG":150},"windows":{"openWindowSecs":1800,"shipWindowSecs":1800}}');
    expect(termsHash(terms)).toBe('856b0ef39c7714245dc3d09939f91ebccdbab9621f63d277a14ba75b83f37df6');
  });
  it('pula plomb §11: shortCode i sealHash plomby 01', () => {
    const nonce = 'db5d2cfddd7dd2af2dac6cb188a93966';
    expect(shortCode(nonce)).toBe('SS-DB5D-2C');
    expect(sealHash(sealPayload(ORDER, nonce))).toBe('95fda3bc72140eab523408669378dfd6306be973bb62f3fd2692703e109b55f7');
  });
  it.skipIf(!process.env.PROGRAM_ID || !process.env.ESCROW_PDA_01)('escrowPda (PROGRAM_ID z §5)', () => {
    expect(escrowPda(ORDER, process.env.PROGRAM_ID!)).toBe(process.env.ESCROW_PDA_01);
  });
});

const good: Measurements = {
  recordingValid: true, qrMatch: true, sealIntact: true, packageScore: 90,
  weightDiffG: 10, matchScore: 90, defectFound: false, testsPassed: true,
};

describe('evaluateVerdict (tabela §3)', () => {
  const t = DEFAULT_THRESHOLDS;
  it('kolejność wierszy', () => {
    expect(evaluateVerdict({ ...good, recordingValid: false, qrMatch: false }, t).reason).toBe('RecordingInvalid');
    expect(evaluateVerdict({ ...good, qrMatch: false, defectFound: true }, t)).toMatchObject({ released: false, reason: 'TransitBroken' });
    expect(evaluateVerdict({ ...good, weightDiffG: 151 }, t).reason).toBe('TransitBroken');
    expect(evaluateVerdict({ ...good, packageScore: 59 }, t).reason).toBe('TransitBroken');
    expect(evaluateVerdict({ ...good, defectFound: true }, t)).toMatchObject({ released: false, reason: 'ItemMismatch' });
    expect(evaluateVerdict({ ...good, matchScore: 69 }, t).reason).toBe('ItemMismatch');
    expect(evaluateVerdict({ ...good, testsPassed: false }, t).reason).toBe('ItemMismatch');
    expect(evaluateVerdict({ ...good, weightDiffG: 150, matchScore: 70, packageScore: 60 }, t))
      .toMatchObject({ released: true, reason: 'VerifiedOk' });
  });
  it('splitPayout', () => {
    expect(splitPayout('200000000', 100, true)).toEqual({ payout: '198000000', fee: '2000000' });
    expect(splitPayout('199', 100, true)).toEqual({ payout: '198', fee: '1' });
    expect(splitPayout('200000000', 100, false)).toEqual({ payout: '200000000', fee: '0' });
  });
});

describe('deriveStatus (§4.2)', () => {
  const off = { packingVerification: null, hasReadyForPickup: false, unboxingVerification: null } as const;
  it('mapowanie', () => {
    expect(deriveStatus('none', off)).toBe('awaiting_payment');
    expect(deriveStatus('Funded', off)).toBe('funded');
    expect(deriveStatus('Funded', { ...off, packingVerification: 'processing' })).toBe('packing_review');
    expect(deriveStatus('Funded', { ...off, packingVerification: 'done' })).toBe('ready_to_ship');
    expect(deriveStatus('Shipped', off)).toBe('shipped');
    expect(deriveStatus('Shipped', { ...off, hasReadyForPickup: true })).toBe('delivered');
    expect(deriveStatus('Shipped', { ...off, hasReadyForPickup: true, unboxingVerification: 'processing' })).toBe('unboxing_review');
    expect(deriveStatus('Verifying', off)).toBe('verifying');
    expect(deriveStatus('Released', { ...off, unboxingVerification: 'done' })).toBe('released');
    expect(deriveStatus('Refunded', off)).toBe('refunded');
  });
});

describe('fakeChain', () => {
  const B = 'BuyerWaLLet11111111111111111111111111111111';
  const S = 'SeLLerWaLLet1111111111111111111111111111111';
  const H = 'a'.repeat(64);
  const fund = { action: 'fund' as const, orderId: ORDER, buyer: B, seller: S, amountLamports: '200000000',
                 termsHash: H, thresholds: DEFAULT_THRESHOLDS, windows: DEFAULT_WINDOWS };
  const t0 = 1_000_000;

  it('pełny przepływ VerifiedOk', () => {
    let s = applyAction(null, fund, t0).state;
    expect(s.status).toBe('Funded');
    expect(s.shipDeadline).toBe(t0 + 1800);
    s = applyAction(s, { action: 'commit_shipment', expectedAmountLamports: '200000000', expectedTermsHash: H,
                         sealHash: H, packingVideoHash: H }, t0 + 10).state;
    expect(s).toMatchObject({ status: 'Shipped', openDeadline: t0 + 10 + 1800 });
    s = applyAction(s, { action: 'open_claim', unboxingVideoHash: H }, t0 + 20).state;
    expect(s).toMatchObject({ status: 'Verifying', verdictDeadline: t0 + 20 + 600 });
    const r = applyAction(s, { action: 'submit_verdict', measurements: good }, t0 + 30);
    expect(r.state).toMatchObject({ status: 'Released', reason: 'VerifiedOk', resolvedAt: t0 + 30 });
  });

  it('błędy i timeouty', () => {
    const s = applyAction(null, fund, t0).state;
    expect(() => applyAction(s, { action: 'commit_shipment', expectedAmountLamports: '1', expectedTermsHash: H,
      sealHash: H, packingVideoHash: H }, t0)).toThrow(FakeChainError);
    expect(() => applyAction(s, { action: 'claim_timeout' }, t0 + 1800)).toThrow('DeadlineNotReached');
    expect(applyAction(s, { action: 'claim_timeout' }, t0 + 1801).state.reason).toBe('ShipTimeout');
    expect(applyAction(s, { action: 'seller_decline', signer: S }, t0).state.reason).toBe('SellerDeclined');
    expect(() => applyAction(s, { action: 'seller_decline', signer: B }, t0)).toThrow('Unauthorized');
    expect(() => applyAction(null, { ...fund, seller: B }, t0)).toThrow('SameParty');
    expect(() => applyAction(null, { ...fund, windows: { shipWindowSecs: 30, openWindowSecs: 1800 } }, t0)).toThrow('InvalidWindow');
    expect(timeoutOutcome({ status: 'Verifying', shipDeadline: 0, openDeadline: 0, verdictDeadline: 5 }, 6)?.reason)
      .toBe('VerifierTimeout');
  });
});
