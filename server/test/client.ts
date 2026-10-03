// Minimalny klient HTTP do testów backendu (bez zależności od klienta aplikacji).
// Odpowiedzi są walidowane schematami z @unbox/shared, błędy mają `code` z odpowiedzi API.
import { z } from 'zod';
import {
  AuthResponseSchema, CategorySchema, type ComplaintCategory, type CreateListingInput, createQr, type Deal, DealSchema,
  ListingSchema, MediaUploadSchema, type Role, verifyQr, WalletSchema,
} from '@unbox/shared';

export class TestApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export type Upload = { kind: 'blob'; blob: Blob; name: string };
type Video = { source: Upload };

export function createTestClient(baseUrl: string) {
  let token: string | null = null;

  async function req<S extends z.ZodType>(schema: S, method: string, path: string, o: { body?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Promise<z.infer<S>> {
    const headers: Record<string, string> = { ...o.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new TestApiError(json?.error?.code ?? `HTTP_${res.status}`, json?.error?.message ?? '', res.status);
    return schema.parse(json);
  }

  const qrSecret = (deal: Deal, payload: string, kind: 'ship' | 'return') => {
    const v = verifyQr(payload, { kind, dealId: deal.id, commitment: kind === 'ship' ? deal.qrCommitment : deal.returnQrCommitment });
    if (!v.ok) throw new TestApiError('QR_MISMATCH', v.reason, 0);
    return v.secret;
  };

  const media = {
    upload(src: Upload) {
      const f = new FormData();
      f.append('file', src.blob, src.name);
      return req(MediaUploadSchema, 'POST', '/api/media', { form: f });
    },
  };
  const deals = {
    list: (role: Role) => req(z.array(DealSchema), 'GET', `/api/deals?role=${role}`),
    get: (id: string) => req(DealSchema, 'GET', `/api/deals/${id}`),
    settle: (id: string) => req(DealSchema, 'POST', `/api/deals/${id}/settle`),
  };
  const listings = {
    categories: () => req(z.array(CategorySchema), 'GET', '/api/categories'),
    list: () => req(z.array(ListingSchema), 'GET', '/api/listings'),
    create: (i: CreateListingInput) => req(ListingSchema, 'POST', '/api/listings', { body: i }),
    purchase: (id: string) => req(DealSchema, 'POST', `/api/listings/${id}/purchase`),
  };
  const auth = {
    async login(i: { email: string; password: string }) {
      const r = await req(AuthResponseSchema, 'POST', '/api/auth/login', { body: i });
      token = r.token;
      return r.user;
    },
    wallet: () => req(WalletSchema, 'GET', '/api/me/wallet'),
  };
  const flows = {
    purchaseListing: listings.purchase,
    prepareShippingQr: (dealId: string) => createQr('ship', dealId),
    prepareReturnQr: (dealId: string) => createQr('return', dealId),
    async shipDeal(id: string, i: { qrCommitment: string; packingVideo: Video; trackingNumber: string }) {
      const v = await media.upload(i.packingVideo.source);
      return req(DealSchema, 'POST', `/api/deals/${id}/ship`, { body: { qrCommitment: i.qrCommitment, packingVideoSha256: v.sha256, trackingNumber: i.trackingNumber } });
    },
    acceptDeal: async (deal: Deal, payload: string) =>
      req(DealSchema, 'POST', `/api/deals/${deal.id}/accept`, { body: { qrSecret: qrSecret(deal, payload, 'ship') } }),
    async openDispute(deal: Deal, i: { scannedPayload: string; unboxingVideo: Video; demoScenario?: string;
                                       complaint: { category: ComplaintCategory; description: string } }) {
      const secret = qrSecret(deal, i.scannedPayload, 'ship');
      const v = await media.upload(i.unboxingVideo.source);
      return req(DealSchema, 'POST', `/api/deals/${deal.id}/dispute`, {
        body: { qrSecret: secret, unboxingVideoSha256: v.sha256, complaint: i.complaint },
        headers: i.demoScenario ? { 'X-Demo-Scenario': i.demoScenario } : undefined,
      });
    },
    async markReturned(id: string, i: { returnQrCommitment: string; returnVideo: Video; returnTrackingNumber: string }) {
      const v = await media.upload(i.returnVideo.source);
      return req(DealSchema, 'POST', `/api/deals/${id}/return`, {
        body: { returnQrCommitment: i.returnQrCommitment, returnVideoSha256: v.sha256, returnTrackingNumber: i.returnTrackingNumber } });
    },
    confirmReturn: async (deal: Deal, payload: string) =>
      req(DealSchema, 'POST', `/api/deals/${deal.id}/confirm-return`, { body: { returnQrSecret: qrSecret(deal, payload, 'return') } }),
    async waitForDeal(id: string, until: (d: Deal) => boolean, o: { intervalMs?: number; timeoutMs?: number } = {}) {
      const end = Date.now() + (o.timeoutMs ?? 30_000);
      for (;;) {
        const d = await deals.get(id);
        if (until(d)) return d;
        if (Date.now() > end) throw new TestApiError('TIMEOUT', `Nie doczekano się stanu transakcji ${id}`, 0);
        await new Promise((r) => setTimeout(r, o.intervalMs ?? 200));
      }
    },
  };
  return { auth, listings, deals, media, flows };
}
