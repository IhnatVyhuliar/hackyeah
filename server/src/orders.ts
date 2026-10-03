// Stan zamówienia = dane off-chain + odczyt konta escrow. Terminalny stan on-chain zawsze wygrywa (§4.2).
// Serwer niczego tu nie rozstrzyga: status, terminy, pomiary i powód pochodzą z konta escrow.
import {
  deriveStatus, type EscrowState, explorerTxUrl, nowUnix, type Order, type OutcomeReason, type TxAction,
  type Verification,
} from '@sellsol/shared';
import { mockAi } from './ai/mockAi';
import { httpAi } from './ai/httpAi';
import type { AiAdapter } from './ai/types';
import { devnetChain } from './chain/devnetChain';
import { mockChain } from './chain/mockChain';
import type { ChainAdapter } from './chain/types';
import { config } from './config';
import { docs } from './db';
import { ApiErr } from './errors';

export const chain: ChainAdapter = config.chain === 'devnet' ? devnetChain : mockChain;
export const ai: AiAdapter = config.ai === 'http' ? httpAi : mockAi;

const REASON_PL: Record<OutcomeReason, string> = {
  BuyerConfirmed: 'kupujący potwierdził odbiór',
  VerifiedOk: 'weryfikacja potwierdziła zgodność',
  RecordingInvalid: 'nagranie otwarcia było nieważne',
  TransitBroken: 'naruszenie lub podmiana w transporcie',
  ItemMismatch: 'przedmiot niezgodny z ofertą albo wadliwy',
  ShipTimeout: 'sprzedający nie nadał paczki w terminie',
  OpenTimeout: 'kupujący nie zgłosił wyniku w terminie',
  VerifierTimeout: 'weryfikator nie odpowiedział w terminie',
  SellerDeclined: 'sprzedający odrzucił zamówienie',
};
export const reasonPl = (r: OutcomeReason) => REASON_PL[r];

export function addTimeline(o: Order, type: string, label: string, txSignature?: string) {
  o.timeline.push({ at: nowUnix(), type, label, ...(txSignature ? { txSignature } : {}) });
}

export function addTx(o: Order, action: TxAction, signature: string) {
  if (o.txs.some((t) => t.signature === signature)) return;
  o.txs.push({ action, signature, explorerUrl: explorerTxUrl(signature, o.cluster), at: nowUnix() });
}

export function getOrder(id: string): Order {
  const o = docs.get('order', id);
  if (!o) throw new ApiErr('NOT_FOUND', 'Nie ma takiego zamówienia');
  return o;
}

export const saveOrder = (o: Order) => docs.put('order', o.id, o);

export function verificationsOf(orderId: string, kind?: Verification['kind']): Verification[] {
  return docs.list('verification').filter((v) => v.orderId === orderId && (!kind || v.kind === kind));
}

function offchain(o: Order) {
  const pv = o.packingVerificationId ? docs.get('verification', o.packingVerificationId) : null;
  const uv = o.unboxingVerificationId ? docs.get('verification', o.unboxingVerificationId) : null;
  return {
    packingVerification: pv?.status ?? null,
    hasReadyForPickup: o.lockerEvents.some((e) => e.type === 'ready_for_pickup'),
    unboxingVerification: uv?.status ?? null,
  };
}

const STATUS_LABEL: Record<EscrowState['status'], string> = {
  Funded: 'Kupujący wpłacił środki do escrow',
  Shipped: 'Sprzedający zatwierdził nadanie (warunki zaakceptowane on-chain)',
  Verifying: 'Kupujący zgłosił wynik otwarcia, program czeka na pomiary',
  Released: 'Program wypłacił środki sprzedającemu',
  Refunded: 'Program zwrócił środki kupującemu',
};

/** Przepisuje dane z konta escrow do zamówienia i liczy status API. */
export function applyEscrow(o: Order, e: EscrowState | null): Order {
  const prev = o.chainStatus;
  if (e) {
    o.chainStatus = e.status;
    o.shipDeadline = e.shipDeadline;
    o.openDeadline = e.openDeadline;
    o.verdictDeadline = e.verdictDeadline;
    if (e.packingVideoHash) o.packingVideoHash = e.packingVideoHash;
    if (e.unboxingVideoHash) o.unboxingVideoHash = e.unboxingVideoHash;
    o.measurements = e.measurements;
    o.outcomeReason = e.reason;
    if (prev !== e.status) {
      const reason = e.reason ? ` (${reasonPl(e.reason)})` : '';
      addTimeline(o, `chain_${e.status.toLowerCase()}`, STATUS_LABEL[e.status] + reason);
      if (e.status === 'Released' || e.status === 'Refunded') {
        const listing = docs.get('listing', o.listing.id);
        const status = e.status === 'Released' ? 'sold' : 'active';
        if (listing) docs.put('listing', listing.id, { ...listing, status });
        o.listing = { ...o.listing, status };
      }
    }
  } else {
    o.chainStatus = 'none';
  }
  o.status = deriveStatus(o.chainStatus, offchain(o));
  return o;
}

const cache = new Map<string, { at: number; state: EscrowState | null }>();
const CACHE_MS = 2000;

export async function readEscrow(orderId: string, force = false): Promise<EscrowState | null> {
  const hit = cache.get(orderId);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.state;
  const state = await chain.read(orderId);
  cache.set(orderId, { at: Date.now(), state });
  return state;
}

export function rememberEscrow(orderId: string, state: EscrowState | null) {
  cache.set(orderId, { at: Date.now(), state });
}

/** Odświeża zamówienie z łańcucha (cache 2 s) i zapisuje. */
export async function syncOrder(o: Order, force = false): Promise<Order> {
  try {
    applyEscrow(o, await readEscrow(o.id, force));
  } catch (e) {
    // RPC chwilowo niedostępne: zwracamy ostatni znany stan, ale status liczymy dalej.
    console.warn('[chain] odczyt nie powiódł się', (e as Error).message);
    o.status = deriveStatus(o.chainStatus, offchain(o));
  }
  return saveOrder(o);
}

/** Widok dla uczestnika: treść QR plomby tylko dla sprzedającego (§6). */
export function viewOrder(o: Order, userId: string): Order {
  if (userId === o.sellerId || !o.seal) return o;
  const { qrPayload: _, ...seal } = o.seal;
  return { ...o, seal };
}

export function roleIn(o: Order, userId: string): 'buyer' | 'seller' {
  if (o.buyerId === userId) return 'buyer';
  if (o.sellerId === userId) return 'seller';
  throw new ApiErr('FORBIDDEN', 'Nie jesteś uczestnikiem tego zamówienia');
}
