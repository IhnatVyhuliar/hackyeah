// Escrow over the PAYMENTS=demo REST actions: development without the chain and the offline fallback demo.
// The server enforces every rule here (state machine, deadlines, QR commitments); the app only submits.
import { EscrowError, createQr, parseQrPayload, type DealKey, type Escrow, type EscrowErrorCode, type TxResult } from '@unbox/shared';
import { api as defaultApi, ApiError, type Api } from '../api/client';

const NONE: TxResult = { signature: null, explorerUrl: null };
const CODES: Record<string, EscrowErrorCode> = {
  INVALID_STATE: 'InvalidStatus', DEADLINE_PASSED: 'DeadlinePassed', DEADLINE_NOT_REACHED: 'DeadlineNotReached',
  QR_MISMATCH: 'QrMismatch', INSUFFICIENT_FUNDS: 'InsufficientFunds', FORBIDDEN: 'Unauthorized', NETWORK: 'Network',
  UPSTREAM: 'Network', VALIDATION: 'Rejected', NOT_FOUND: 'Rejected',
};

function secretOf(kind: 'ship' | 'return', k: DealKey, payload: string): string {
  const p = parseQrPayload(payload);
  if (!p || p.kind !== kind || p.dealId !== k.id) {
    throw new EscrowError('QrMismatch', kind === 'ship'
      ? 'Kod z karty nie pasuje do tej przesyłki. Umowa jest bez zmian – zeskanuj kartę z tej paczki.'
      : 'Kod nie pasuje do karty zwrotu tej umowy. Zeskanuj kartę zwrotu z odesłanej paczki.');
  }
  return p.secret;
}

/** `scenario` = mock AI scenario for disputes (server AI=mock): 'defect' → BUYER, none → SELLER. Dev menu only. */
export function createDemoEscrow(a: Api = defaultApi, opts: { scenario?: string } = {}): Escrow {
  const call = async (path: string, body?: unknown, headers?: Record<string, string>): Promise<TxResult> => {
    try {
      await a.post(path, body, headers);
      return NONE;
    } catch (e) {
      if (e instanceof ApiError) throw new EscrowError(CODES[e.code] ?? 'Rejected', e.message);
      throw e;
    }
  };
  return {
    mode: 'demo',
    walletAddress: async () => null,
    // The server's clock, so countdowns follow POST /api/dev/clock; the phone clock when the dev clock is off.
    networkNow: async () => {
      try {
        return (await a.post<{ now: number }>('/api/dev/clock', { advanceSecs: 0 })).now;
      } catch {
        return Math.floor(Date.now() / 1000);
      }
    },
    requestTestSol: async () => { throw new EscrowError('Rejected', 'W trybie demo saldo startowe ustawia serwer.'); },
    createListing: async () => NONE,
    cancelListing: (k) => call(`/api/listings/${k.id}/cancel`),
    purchase: (k) => call(`/api/listings/${k.id}/purchase`),
    newQrCard: async (kind, k) => {
      const q = createQr(kind, k.id);
      return { kind, payload: q.payload, commitment: q.commitment };
    },
    markShipped: (k, i) => call(`/api/deals/${k.id}/ship`, i),
    acceptDelivery: async (k, payload) => call(`/api/deals/${k.id}/accept`, { qrSecret: secretOf('ship', k, payload) }),
    openDispute: async (k, i) => call(`/api/deals/${k.id}/dispute`, {
      qrSecret: secretOf('ship', k, i.qrPayload), unboxingVideoSha256: i.unboxingVideoSha256, complaint: i.complaint,
    }, opts.scenario ? { 'X-Demo-Scenario': opts.scenario } : undefined),
    markReturned: (k, i) => call(`/api/deals/${k.id}/return`, {
      returnQrCommitment: i.returnQrCommitment, returnVideoSha256: i.returnVideoSha256, returnTrackingNumber: i.trackingNumber,
    }),
    confirmReturn: async (k, payload) => call(`/api/deals/${k.id}/confirm-return`, { returnQrSecret: secretOf('return', k, payload) }),
    settleExpired: (k) => call(`/api/deals/${k.id}/settle`),
  };
}
