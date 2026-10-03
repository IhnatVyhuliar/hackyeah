// Przepływy sklepu dla ekranów: zawsze najpierw upload nagrania, potem akcja z jego hashem.
// QR: generowanie i weryfikacja przez @unbox/shared; backend i tak sprawdza commitment (409 QR_MISMATCH).
import {
  availableActions, type ComplaintCategory, createQr, type Deal, type DealAction, POLL_MS, verifyQr,
} from '@unbox/shared';
import { authApi } from './auth';
import { dealsApi } from './deals';
import { clientError } from './errors';
import type { Http } from './http';
import { listingsApi } from './listings';
import { mediaApi, type UploadSource } from './media';

export interface VideoInput { source: UploadSource; sha256?: string }   // sha256 policzony w aplikacji (opcjonalnie)

function scanned(deal: Deal, payload: string, kind: 'ship' | 'return') {
  const v = verifyQr(payload, { kind, dealId: deal.id, commitment: kind === 'ship' ? deal.qrCommitment : deal.returnQrCommitment });
  if (!v.ok) throw clientError('QR_MISMATCH', v.reason);
  return v.secret;
}

export const flowsApi = (http: Http) => {
  const deals = dealsApi(http), media = mediaApi(http), listings = listingsApi(http), auth = authApi(http);
  const uploadVideo = (v: VideoInput) => media.upload(v.source, { expectedSha256: v.sha256 });

  return {
    purchaseListing: (listingId: string) => listings.purchase(listingId),
    fetchDeals: deals.list,
    fetchDeal: deals.get,

    /** Sprzedający: nowy kod QR do wydruku. `commitment` zachowaj do shipDeal; `payload` drukujesz na karcie. */
    prepareShippingQr: (dealId: string) => createQr('ship', dealId),
    /** Sprzedający: wysyła nagranie pakowania, potem oznacza nadanie. */
    async shipDeal(dealId: string, i: { qrCommitment: string; packingVideo: VideoInput; trackingNumber: string }) {
      const video = await uploadVideo(i.packingVideo);
      return deals.ship(dealId, { qrCommitment: i.qrCommitment, packingVideoSha256: video.sha256, trackingNumber: i.trackingNumber });
    },

    /** Kupujący: „Wszystko OK” po zeskanowaniu QR z paczki (nagranie nie jest wysyłane). */
    acceptDeal: async (deal: Deal, scannedPayload: string) => deals.accept(deal.id, { qrSecret: scanned(deal, scannedPayload, 'ship') }),

    /** Kupujący: „Reklamuję” — sprawdza QR, wysyła nagranie otwarcia, potem zgłasza reklamację. */
    async openDispute(deal: Deal, i: { scannedPayload: string; unboxingVideo: VideoInput;
                                       complaint: { category: ComplaintCategory; description: string }; demoScenario?: string }) {
      const qrSecret = scanned(deal, i.scannedPayload, 'ship');
      const video = await uploadVideo(i.unboxingVideo);
      return deals.dispute(deal.id, { qrSecret, unboxingVideoSha256: video.sha256, complaint: i.complaint }, { demoScenario: i.demoScenario });
    },

    /** Kupujący: nowy kod QR zwrotu (generowany w aplikacji kupującego). */
    prepareReturnQr: (dealId: string) => createQr('return', dealId),
    async markReturned(dealId: string, i: { returnQrCommitment: string; returnVideo: VideoInput; returnTrackingNumber: string }) {
      const video = await uploadVideo(i.returnVideo);
      return deals.markReturned(dealId, { returnQrCommitment: i.returnQrCommitment, returnVideoSha256: video.sha256,
                                          returnTrackingNumber: i.returnTrackingNumber });
    },
    /** Sprzedający: skanuje QR zwrotu i potwierdza odbiór → zwrot środków kupującemu. */
    confirmReturn: async (deal: Deal, scannedPayload: string) =>
      deals.confirmReturn(deal.id, { returnQrSecret: scanned(deal, scannedPayload, 'return') }),

    /** „Odbierz środki” po terminie. */
    settleDeal: deals.settle,

    /** Akcje dostępne teraz dla zalogowanego użytkownika (do pokazywania przycisków). */
    actionsFor: (deal: Deal, userId: string, nowUnix = Math.floor(Date.now() / 1000)): DealAction['type'][] =>
      availableActions(deal, userId, nowUnix),

    /** Odpytuje transakcję, aż spełni warunek (np. koniec oceny reklamacji). */
    async waitForDeal(id: string, until: (d: Deal) => boolean, opts: { intervalMs?: number; timeoutMs?: number } = {}) {
      const end = Date.now() + (opts.timeoutMs ?? 180_000);
      for (;;) {
        const d = await deals.get(id);
        if (until(d)) return d;
        if (Date.now() > end) throw clientError('TIMEOUT', 'Ocena trwa dłużej niż zwykle — sprawdź za chwilę');
        await new Promise((r) => setTimeout(r, opts.intervalMs ?? POLL_MS));
      }
    },
    auth,
  };
};
