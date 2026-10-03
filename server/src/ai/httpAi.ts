// AI=http: adapter do serwisu wyroczni (Osoba 5). Wysyła dowody jako publiczne URL-e z haszami;
// odpowiedź (OracleResponse) waliduje backend w disputes.ts. Tu nie ma logiki oceny.
import type { OracleRequest } from '@unbox/shared';
import { config } from '../config';
import type { AiAdapter, DisputeEvidence } from './types';

export const httpAi: AiAdapter = {
  kind: 'http',
  async analyzeDispute(e: DisputeEvidence) {
    const { deal } = e;
    const body: OracleRequest = {
      deal_id: deal.id,
      listing: deal.listing,                       // ListingMetadata zamrożone przy zakupie (zdjęcia: url + sha256)
      listing_hash: deal.listingHash,
      tracking_number: deal.trackingNumber,
      packing_video: { url: e.packingVideo.url, sha256: e.packingVideo.sha256 },
      unboxing_video: { url: e.unboxingVideo.url, sha256: e.unboxingVideo.sha256 },
      complaint: e.complaint,
    };
    const res = await fetch(`${config.aiUrl}/v1/disputes/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.aiTimeoutMs),
    });
    if (!res.ok) throw new Error(`Serwis AI: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
    return res.json();
  },
  async health() {
    try {
      const r = await fetch(`${config.aiUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return { ok: r.ok, detail: r.ok ? 'http' : `http (HTTP ${r.status})` };
    } catch { return { ok: false, detail: 'http (niedostępny)' }; }
  },
};
