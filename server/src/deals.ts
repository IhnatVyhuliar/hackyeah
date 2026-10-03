// Transakcje: backend jest źródłem prawdy. Każda zmiana stanu przechodzi przez transition() z @unbox/shared,
// a rozliczenie płatności dzieje się w tej samej transakcji SQLite co zapis stanu.
import {
  type Deal, type DealAction, hashDocument, type Listing, listingMetadata, transition, type User,
} from '@unbox/shared';
import { now } from './clock';
import { config } from './config';
import { docs, tx } from './db';
import { ApiErr } from './errors';
import * as wallet from './wallet';

export function getDeal(id: string): Deal {
  const d = docs.get('deal', id);
  if (!d) throw new ApiErr('NOT_FOUND', 'Nie ma takiej transakcji');
  return d;
}

export function requireParticipant(d: Deal, userId: string): 'buyer' | 'seller' {
  if (d.buyerId === userId) return 'buyer';
  if (d.sellerId === userId) return 'seller';
  throw new ApiErr('FORBIDDEN', 'Nie jesteś stroną tej transakcji');
}

/** Wykonuje akcję atomowo: stan + oś czasu + księga płatności. */
export function applyAction(dealId: string, action: DealAction): Deal {
  return tx(() => {
    const d = getDeal(dealId);
    const r = transition(d, action, now(), config.timeouts);
    const next: Deal = { ...r.deal, timeline: [...d.timeline, r.event] };
    if (r.effect) wallet.settle(next, r.effect);
    return docs.put('deal', next.id, next);
  });
}

/** Leniwe domknięcie po terminie (settle_expired). Zwraca aktualny stan. */
export function expireIfDue(dealId: string): Deal {
  const d = getDeal(dealId);
  if (d.deadlineAt == null || now() < d.deadlineAt) return d;
  try {
    return applyAction(dealId, { type: 'expire' });
  } catch (e) {
    console.warn(`[deals] expire ${dealId}:`, (e as Error).message);
    return getDeal(dealId);
  }
}

export function purchase(listingId: string, buyer: User): Deal {
  return tx(() => {
    const l = docs.get('listing', listingId);
    if (!l) throw new ApiErr('NOT_FOUND', 'Nie ma takiego ogłoszenia');
    if (l.sellerId === buyer.id) throw new ApiErr('FORBIDDEN', 'Nie możesz kupić własnego ogłoszenia');
    if (l.status !== 'Listed') throw new ApiErr('INVALID_STATE', 'Ogłoszenie nie jest już dostępne');
    const t = now();
    const metadata = listingMetadata(l);
    const deal: Deal = {
      id: l.id, listing: metadata, listingHash: hashDocument(metadata),
      sellerId: l.sellerId, seller: l.seller, buyerId: buyer.id, buyer: { id: buyer.id, name: buyer.name },
      status: 'Paid', statusChangedAt: t, deadlineAt: t + config.timeouts.Paid,
      payment: { status: 'secured', amountMinor: l.priceMinor, currency: l.currency, securedAt: t, settledAt: null },
      qrCommitment: null, packingVideoSha256: null, trackingNumber: null,
      unboxingVideoSha256: null, complaint: null, complaintHash: null, analysis: null, verdict: null,
      returnQrCommitment: null, returnVideoSha256: null, returnTrackingNumber: null, closeReason: null,
      timeline: [{ at: t, type: 'paid', label: 'Kupujący zapłacił: środki zabezpieczone do zakończenia transakcji' }],
      createdAt: t,
    };
    wallet.secure(deal);
    docs.put('listing', l.id, { ...l, status: 'Sold', updatedAt: t } satisfies Listing);
    return docs.put('deal', deal.id, deal);
  });
}

export function dealsOf(userId: string, role: 'buyer' | 'seller'): Deal[] {
  return docs.list('deal')
    .filter((d) => (role === 'buyer' ? d.buyerId : d.sellerId) === userId)
    .map((d) => expireIfDue(d.id))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Domyka przeterminowane transakcje użytkownika (np. przed policzeniem salda w portfelu). */
export function expireDueFor(userId: string) {
  for (const d of docs.list('deal')) {
    if ((d.buyerId === userId || d.sellerId === userId) && d.deadlineAt != null && now() >= d.deadlineAt) expireIfDue(d.id);
  }
}

/** Domyka wszystkie transakcje po terminie (wywoływane cyklicznie). */
export function sweepExpired(): number {
  let n = 0;
  for (const d of docs.list('deal')) {
    if (d.deadlineAt != null && now() >= d.deadlineAt) { expireIfDue(d.id); n++; }
  }
  return n;
}
