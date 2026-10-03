// Maszyna stanów transakcji (CLAUDE.md §4 bez blockchaina). Czyste funkcje: wykonuje je backend,
// który jest źródłem prawdy; aplikacja może ich użyć do podglądu (np. które przyciski pokazać).
import { STATUS_LABELS_PL, type Timeouts } from './constants';
import { deadlineFor, returnCommitment, shipCommitment } from './helpers';
import type { CloseReason, Complaint, Deal, ErrorCode, Hex32, TimelineEvent, Unix, Verdict } from './types';

export class DealError extends Error {
  constructor(public code: Extract<ErrorCode, 'FORBIDDEN' | 'INVALID_STATE' | 'DEADLINE_PASSED' | 'DEADLINE_NOT_REACHED' | 'QR_MISMATCH'>,
              message: string) {
    super(message);
    this.name = 'DealError';
  }
}

export type DealAction =
  | { type: 'ship'; actorId: string; qrCommitment: Hex32; packingVideoSha256: Hex32; trackingNumber: string }
  | { type: 'accept'; actorId: string; qrSecret: Hex32 }
  | { type: 'dispute'; actorId: string; qrSecret: Hex32; unboxingVideoSha256: Hex32; complaint: Complaint; complaintHash: Hex32 }
  | { type: 'resolve'; verdict: Verdict }                          // system: wynik decide() po analizie
  | { type: 'return'; actorId: string; returnQrCommitment: Hex32; returnVideoSha256: Hex32; returnTrackingNumber: string }
  | { type: 'confirm_return'; actorId: string; returnQrSecret: Hex32 }
  | { type: 'expire' };                                           // po terminie, może wywołać każdy

export type PaymentEffect = 'release' | 'refund' | null;
export interface TransitionResult { deal: Deal; effect: PaymentEffect; event: TimelineEvent }

const fail = (code: DealError['code'], msg: string): never => { throw new DealError(code, msg); };

function requireStatus(d: Deal, ...ok: Deal['status'][]) {
  if (!ok.includes(d.status)) fail('INVALID_STATE', `Transakcja jest w stanie ${d.status} (${STATUS_LABELS_PL[d.status]})`);
}
function requireActor(d: Deal, actorId: string, role: 'buyer' | 'seller') {
  if ((role === 'buyer' ? d.buyerId : d.sellerId) !== actorId)
    fail('FORBIDDEN', role === 'buyer' ? 'Tę akcję wykonuje kupujący' : 'Tę akcję wykonuje sprzedający');
}
function requireBeforeDeadline(d: Deal, now: Unix) {
  if (d.deadlineAt != null && now >= d.deadlineAt) fail('DEADLINE_PASSED', 'Termin na tę akcję minął');
}

function moveTo(d: Deal, status: Deal['status'], now: Unix, timeouts: Timeouts, closeReason: CloseReason | null = null): Deal {
  return { ...d, status, statusChangedAt: now, deadlineAt: deadlineFor(status, now, timeouts), closeReason: closeReason ?? d.closeReason };
}

function settle(d: Deal, effect: Exclude<PaymentEffect, null>, now: Unix): Deal {
  // Ochrona przed podwójnym rozliczeniem: środki można zwolnić albo zwrócić tylko raz.
  if (d.payment.status !== 'secured') fail('INVALID_STATE', 'Płatność jest już rozliczona');
  return { ...d, payment: { ...d.payment, status: effect === 'release' ? 'released' : 'refunded', settledAt: now } };
}

const EXPIRE: Record<string, { to: Deal['status']; effect: PaymentEffect; reason: CloseReason | null; label: string }> = {
  Paid: { to: 'Refunded', effect: 'refund', reason: 'ship_timeout', label: 'Sprzedający nie nadał paczki w terminie: środki wróciły do kupującego' },
  Shipped: { to: 'Completed', effect: 'release', reason: 'unbox_timeout', label: 'Brak decyzji kupującego w terminie: środki trafiły do sprzedającego' },
  Disputed: { to: 'ReturnRequested', effect: null, reason: null, label: 'Brak oceny reklamacji w terminie: neutralny zwrot towaru za pieniądze' },
  ReturnRequested: { to: 'Completed', effect: 'release', reason: 'return_ship_timeout', label: 'Kupujący nie odesłał paczki w terminie: środki trafiły do sprzedającego' },
  Returning: { to: 'Refunded', effect: 'refund', reason: 'return_confirm_timeout', label: 'Sprzedający nie potwierdził zwrotu w terminie: środki wróciły do kupującego' },
};

export function transition(deal: Deal, a: DealAction, now: Unix, timeouts: Timeouts): TransitionResult {
  const ev = (type: string, label: string): TimelineEvent => ({ at: now, type, label });
  let d = deal;
  switch (a.type) {
    case 'ship':
      requireActor(d, a.actorId, 'seller'); requireStatus(d, 'Paid'); requireBeforeDeadline(d, now);
      d = moveTo({ ...d, qrCommitment: a.qrCommitment, packingVideoSha256: a.packingVideoSha256, trackingNumber: a.trackingNumber },
        'Shipped', now, timeouts);
      return { deal: d, effect: null, event: ev('shipped', `Sprzedający nadał paczkę (${a.trackingNumber})`) };

    case 'accept':
      requireActor(d, a.actorId, 'buyer'); requireStatus(d, 'Shipped'); requireBeforeDeadline(d, now);
      if (shipCommitment(d.id, a.qrSecret) !== d.qrCommitment) fail('QR_MISMATCH', 'Kod QR nie pasuje do tej przesyłki');
      d = settle(moveTo(d, 'Completed', now, timeouts, 'accepted'), 'release', now);
      return { deal: d, effect: 'release', event: ev('accepted', 'Kupujący potwierdził: wszystko OK. Środki trafiły do sprzedającego') };

    case 'dispute':
      requireActor(d, a.actorId, 'buyer'); requireStatus(d, 'Shipped'); requireBeforeDeadline(d, now);
      if (shipCommitment(d.id, a.qrSecret) !== d.qrCommitment) fail('QR_MISMATCH', 'Kod QR nie pasuje do tej przesyłki');
      d = moveTo({ ...d, unboxingVideoSha256: a.unboxingVideoSha256, complaint: a.complaint, complaintHash: a.complaintHash },
        'Disputed', now, timeouts);
      return { deal: d, effect: null, event: ev('disputed', 'Kupujący złożył reklamację z nagraniem otwarcia') };

    case 'resolve':
      requireStatus(d, 'Disputed'); requireBeforeDeadline(d, now);
      if (a.verdict === 'SELLER') {
        d = settle(moveTo({ ...d, verdict: 'SELLER' }, 'Completed', now, timeouts, 'verdict_seller'), 'release', now);
        return { deal: d, effect: 'release', event: ev('resolved_seller', 'Reklamacja odrzucona: środki trafiły do sprzedającego') };
      }
      d = moveTo({ ...d, verdict: 'BUYER' }, 'ReturnRequested', now, timeouts);
      return { deal: d, effect: null, event: ev('resolved_buyer', 'Reklamacja uznana: kupujący odsyła paczkę') };

    case 'return':
      requireActor(d, a.actorId, 'buyer'); requireStatus(d, 'ReturnRequested'); requireBeforeDeadline(d, now);
      d = moveTo({ ...d, returnQrCommitment: a.returnQrCommitment, returnVideoSha256: a.returnVideoSha256,
                   returnTrackingNumber: a.returnTrackingNumber }, 'Returning', now, timeouts);
      return { deal: d, effect: null, event: ev('returned', `Kupujący nadał zwrot (${a.returnTrackingNumber})`) };

    case 'confirm_return':
      requireActor(d, a.actorId, 'seller'); requireStatus(d, 'Returning'); requireBeforeDeadline(d, now);
      if (returnCommitment(d.id, a.returnQrSecret) !== d.returnQrCommitment) fail('QR_MISMATCH', 'Kod QR zwrotu nie pasuje');
      d = settle(moveTo(d, 'Refunded', now, timeouts, 'return_confirmed'), 'refund', now);
      return { deal: d, effect: 'refund', event: ev('return_confirmed', 'Sprzedający potwierdził zwrot: środki wróciły do kupującego') };

    case 'expire': {
      const rule = EXPIRE[d.status];
      if (!rule) fail('INVALID_STATE', 'Transakcja jest zakończona');
      if (d.deadlineAt == null || now < d.deadlineAt) fail('DEADLINE_NOT_REACHED', 'Termin jeszcze nie minął');
      d = moveTo(d, rule.to, now, timeouts, rule.reason);
      if (rule.effect) d = settle(d, rule.effect, now);
      return { deal: d, effect: rule.effect, event: ev(`expired_${deal.status}`, rule.label) };
    }
  }
}

/** Akcje dostępne teraz dla użytkownika (do pokazywania przycisków; backend i tak sprawdza). */
export function availableActions(d: Deal, userId: string, now: Unix): DealAction['type'][] {
  const out: DealAction['type'][] = [];
  const open = d.deadlineAt != null && now < d.deadlineAt;
  const isBuyer = d.buyerId === userId, isSeller = d.sellerId === userId;
  if (open && isSeller && d.status === 'Paid') out.push('ship');
  if (open && isBuyer && d.status === 'Shipped') out.push('accept', 'dispute');
  if (open && isBuyer && d.status === 'ReturnRequested') out.push('return');
  if (open && isSeller && d.status === 'Returning') out.push('confirm_return');
  if (d.deadlineAt != null && now >= d.deadlineAt && EXPIRE[d.status]) out.push('expire');
  return out;
}
