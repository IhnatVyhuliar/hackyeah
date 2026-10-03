// Symulacja programu sellsol_escrow (KONTRAKT §5.2) dla trybów mock: aplikacja (Osoba 1) i serwer CHAIN=mock.
// Te same warunki i kody błędów co program; prawdziwą decyzję liczy program on-chain.
import { DEMO_CONFIG_BOUNDS, DEMO_FEE_BPS } from './constants';
import { evaluateVerdict, nowUnix, timeoutOutcome, type Outcome } from './helpers';
import type { Base58, ConfigBounds, EscrowState, Hex32, Measurements, Thresholds, Unix, Windows } from './types';

export type ProgramErrorCode = 'InvalidStatus' | 'DeadlinePassed' | 'DeadlineNotReached' | 'Unauthorized'
  | 'UnauthorizedVerifier' | 'InvalidAmount' | 'InvalidScore' | 'InvalidWindow' | 'SameParty'
  | 'AmountMismatch' | 'TermsMismatch' | 'EmptyHash';

export class FakeChainError extends Error {
  constructor(public code: ProgramErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'FakeChainError';
  }
}

export interface FakeConfig extends ConfigBounds { verifier: Base58; feeWallet: Base58; feeBps: number }

export const DEFAULT_FAKE_CONFIG: FakeConfig = {
  ...DEMO_CONFIG_BOUNDS,
  verifier: 'VeRiFieR11111111111111111111111111111111111',
  feeWallet: 'FeeWaLLet1111111111111111111111111111111111',
  feeBps: DEMO_FEE_BPS,
};

export type FakeAction =
  | { action: 'fund'; signer?: Base58; orderId: string; buyer: Base58; seller: Base58; amountLamports: string;
      termsHash: Hex32; thresholds: Thresholds; windows: Windows }
  | { action: 'seller_decline'; signer?: Base58 }
  | { action: 'commit_shipment'; signer?: Base58; expectedAmountLamports: string; expectedTermsHash: Hex32;
      sealHash: Hex32; packingVideoHash: Hex32 }
  | { action: 'confirm_receipt'; signer?: Base58 }
  | { action: 'open_claim'; signer?: Base58; unboxingVideoHash: Hex32 }
  | { action: 'submit_verdict'; signer?: Base58; measurements: Measurements }
  | { action: 'claim_timeout'; signer?: Base58 };

export interface ApplyResult { state: EscrowState; outcome: Outcome | null }

const ZERO = '0'.repeat(64);
const nonEmpty = (h: string) => { if (!h || h === ZERO) throw new FakeChainError('EmptyHash'); };
const checkSigner = (signer: Base58 | undefined, expected: Base58, code: ProgramErrorCode = 'Unauthorized') => {
  if (signer && signer !== expected) throw new FakeChainError(code);
};
const requireStatus = (s: EscrowState, ...ok: EscrowState['status'][]) => {
  if (!ok.includes(s.status)) throw new FakeChainError('InvalidStatus', `Status ${s.status}, oczekiwano ${ok.join('|')}`);
};

function resolve(s: EscrowState, outcome: Outcome, now: Unix): EscrowState {
  return { ...s, status: outcome.released ? 'Released' : 'Refunded', reason: outcome.reason, resolvedAt: now };
}

/**
 * Stosuje instrukcję do stanu escrow i zwraca nowy stan (nie mutuje wejścia).
 * `outcome` != null, gdy instrukcja rozstrzygnęła escrow (do policzenia wypłaty: splitPayout).
 */
export function applyAction(state: EscrowState | null, a: FakeAction, now: Unix = nowUnix(),
                            config: FakeConfig = DEFAULT_FAKE_CONFIG): ApplyResult {
  if (a.action === 'fund') {
    if (state) throw new FakeChainError('InvalidStatus', 'Escrow już istnieje');
    checkSigner(a.signer, a.buyer);
    if (BigInt(a.amountLamports) <= 0n) throw new FakeChainError('InvalidAmount');
    if (a.buyer === a.seller) throw new FakeChainError('SameParty');
    const t = a.thresholds;
    if (t.minMatchScore > 100 || t.minPackageScore > 100) throw new FakeChainError('InvalidScore');
    const w = a.windows;
    if (w.shipWindowSecs < config.minShipWindow || w.shipWindowSecs > config.maxShipWindow
      || w.openWindowSecs < config.minOpenWindow || w.openWindowSecs > config.maxOpenWindow)
      throw new FakeChainError('InvalidWindow');
    return {
      outcome: null,
      state: {
        orderId: a.orderId, buyer: a.buyer, seller: a.seller, verifier: config.verifier,
        feeWallet: config.feeWallet, feeBps: config.feeBps, amountLamports: a.amountLamports,
        termsHash: a.termsHash, thresholds: { ...t },
        windows: { ...w, verdictWindowSecs: config.verdictWindow },
        status: 'Funded', createdAt: now, shipDeadline: now + w.shipWindowSecs,
        openDeadline: null, verdictDeadline: null,
        sealHash: null, packingVideoHash: null, unboxingVideoHash: null,
        measurements: null, reason: null, resolvedAt: null,
      },
    };
  }

  if (!state) throw new FakeChainError('InvalidStatus', 'Brak konta escrow');
  const s = state;

  switch (a.action) {
    case 'seller_decline': {
      checkSigner(a.signer, s.seller);
      requireStatus(s, 'Funded');
      const outcome: Outcome = { released: false, reason: 'SellerDeclined', chargeFee: false };
      return { state: resolve(s, outcome, now), outcome };
    }
    case 'commit_shipment': {
      checkSigner(a.signer, s.seller);
      requireStatus(s, 'Funded');
      if (now > s.shipDeadline) throw new FakeChainError('DeadlinePassed');
      if (a.expectedAmountLamports !== s.amountLamports) throw new FakeChainError('AmountMismatch');
      if (a.expectedTermsHash !== s.termsHash) throw new FakeChainError('TermsMismatch');
      nonEmpty(a.sealHash); nonEmpty(a.packingVideoHash);
      return {
        outcome: null,
        state: { ...s, status: 'Shipped', sealHash: a.sealHash, packingVideoHash: a.packingVideoHash,
                 openDeadline: now + s.windows.openWindowSecs },
      };
    }
    case 'confirm_receipt': {
      checkSigner(a.signer, s.buyer);
      requireStatus(s, 'Shipped', 'Verifying');
      const outcome: Outcome = { released: true, reason: 'BuyerConfirmed', chargeFee: true };
      return { state: resolve(s, outcome, now), outcome };
    }
    case 'open_claim': {
      checkSigner(a.signer, s.buyer);
      requireStatus(s, 'Shipped');
      if (s.openDeadline != null && now > s.openDeadline) throw new FakeChainError('DeadlinePassed');
      nonEmpty(a.unboxingVideoHash);
      return {
        outcome: null,
        state: { ...s, status: 'Verifying', unboxingVideoHash: a.unboxingVideoHash,
                 verdictDeadline: now + s.windows.verdictWindowSecs },
      };
    }
    case 'submit_verdict': {
      checkSigner(a.signer, s.verifier, 'UnauthorizedVerifier');
      requireStatus(s, 'Verifying');
      if (s.verdictDeadline != null && now > s.verdictDeadline) throw new FakeChainError('DeadlinePassed');
      const m = a.measurements;
      if (m.packageScore > 100 || m.matchScore > 100) throw new FakeChainError('InvalidScore');
      const outcome = evaluateVerdict(m, s.thresholds);
      return { state: resolve({ ...s, measurements: { ...m } }, outcome, now), outcome };
    }
    case 'claim_timeout': {
      const outcome = timeoutOutcome(s, now);
      if (!outcome) {
        if (s.status === 'Released' || s.status === 'Refunded') throw new FakeChainError('InvalidStatus');
        throw new FakeChainError('DeadlineNotReached');
      }
      return { state: resolve(s, outcome, now), outcome };
    }
  }
}

export const fakeChain = { applyAction };
