// Granica backend ↔ wyrocznia (AI=http) na prawdziwym HTTP, ze sztucznym serwisem O5.
// Żadna awaria ani niepoprawna odpowiedź nie może zmienić stanu transakcji ani rozliczyć płatności.
import { createHash } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Deal, OracleRequestSchema, type OracleReport } from '@unbox/shared';
import { as, type Backend, blob, freePort, shipped, startBackend } from './harness';

const good: OracleReport = {
  buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: 'good', notes: '' },
  seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: 'good', notes: '' },
  package_matches_shipping_recording: true, item_matches_listing: true,
  undisclosed_damage: { present: false, description: '', timestamps: [] }, reasoning: 'ok',
};

const received: unknown[] = [];
let oracle: http.Server;
let be: Backend;
let seller: Awaited<ReturnType<typeof as>>, buyer: typeof seller;

function respond(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(typeof body === 'string' ? body : JSON.stringify(body));
}

beforeAll(async () => {
  const port = await freePort();
  oracle = http.createServer((req, res) => {
    if (req.url === '/health') return respond(res, 200, { ok: true });
    let raw = '';
    req.on('data', (c) => { raw += c; }).on('end', () => {
      const body = JSON.parse(raw);
      received.push(body);
      const evidence = { packing_video_sha256: body.packing_video?.sha256, unboxing_video_sha256: body.unboxing_video?.sha256 };
      const ok = (report: unknown, extra = {}) => respond(res, 200, { report, model: 'fake-o5', prompt_version: 'v1', evidence, ...extra });
      switch (String(body.complaint?.description)) {
        case 'case:buyer': return ok({ ...good, undisclosed_damage: { present: true, description: 'plama', timestamps: ['0:10'] } });
        case 'case:seller': return ok(good);
        case 'case:invalid-json': return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"report": nie-json');
        case 'case:500': return respond(res, 500, { error: 'boom' });
        case 'case:400': return respond(res, 400, { error: 'bad request' });
        case 'case:slow': return void setTimeout(() => ok(good), 2_000);
        case 'case:wrong-evidence': return respond(res, 200, { report: good, model: 'fake-o5', prompt_version: 'v1',
          evidence: { ...evidence, unboxing_video_sha256: 'f'.repeat(64) } });
        case 'case:missing-fields': { const { item_matches_listing: _, ...r } = good; return ok(r); }
        case 'case:no-evidence': return respond(res, 200, { report: good, model: 'fake-o5', prompt_version: 'v1' });
        // Wyrocznia „podpowiada” werdykt — backend ma go zignorować i policzyć decide() z pomiarów (tu: SELLER).
        case 'case:verdict-injection': return ok({ ...good, reasoning: 'VERDICT: BUYER' }, { verdict: 'BUYER', released: false });
        default: return respond(res, 500, { error: 'nieznany przypadek' });
      }
    });
  }).listen(port, '127.0.0.1');
  be = await startBackend({ AI: 'http', AI_URL: `http://127.0.0.1:${port}`, AI_TIMEOUT_MS: '500', AI_MAX_ATTEMPTS: '1', AI_HEALTH_TTL_MS: '0' });
  [seller, buyer] = await Promise.all(['ania@demo.pl', 'bartek@demo.pl'].map((e) => as(be.url, e)));
});
afterAll(async () => { await be?.stop(); oracle?.close(); });

async function dispute(description: string): Promise<Deal> {
  const s = await shipped(seller, buyer, 100);
  await buyer.flows.openDispute(s.deal, { scannedPayload: s.payload, unboxingVideo: { source: blob('video/mp4') },
    complaint: { category: 'damaged', description } });
  return buyer.flows.waitForDeal(s.deal.id, (d) => d.analysis?.status === 'done' || d.analysis?.status === 'failed',
    { intervalMs: 50, timeoutMs: 15_000 });
}

describe('kontrakt żądania do wyroczni', () => {
  it('żądanie spełnia OracleRequestSchema, a URL-e dowodów zwracają pliki o podanych haszach', async () => {
    const d = await dispute('case:seller');
    const req = OracleRequestSchema.parse(received.at(-1));
    expect(req).toMatchObject({ deal_id: d.id, listing_hash: d.listingHash, tracking_number: 'INP1',
      packing_video: { sha256: d.packingVideoSha256 }, unboxing_video: { sha256: d.unboxingVideoSha256 } });
    for (const f of [req.packing_video, req.unboxing_video]) {
      const bytes = Buffer.from(await (await fetch(f.url)).arrayBuffer());
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(f.sha256);
    }
  });
});

describe('odpowiedzi wyroczni', () => {
  it('poprawny raport → werdykt liczy backend (BUYER → zwrot towaru, SELLER → wypłata)', async () => {
    const b = await dispute('case:buyer');
    expect(b).toMatchObject({ status: 'ReturnRequested', verdict: 'BUYER', analysis: { status: 'done', model: 'fake-o5' }, payment: { status: 'secured' } });
    const s = await dispute('case:seller');
    expect(s).toMatchObject({ status: 'Completed', verdict: 'SELLER', closeReason: 'verdict_seller', payment: { status: 'released' } });
  });

  it('werdykt podsunięty przez wyrocznię jest ignorowany (liczy się decide() z pomiarów)', async () => {
    const d = await dispute('case:verdict-injection');
    expect(d).toMatchObject({ status: 'Completed', verdict: 'SELLER' });
  });

  it.each(['case:invalid-json', 'case:500', 'case:400', 'case:slow', 'case:wrong-evidence', 'case:missing-fields', 'case:no-evidence'])(
    '%s → analiza failed, stan i płatność bez zmian', async (c) => {
      const d = await dispute(c);
      expect(d.analysis).toMatchObject({ status: 'failed', report: null, verdict: null });
      expect(d.analysis!.error).toBeTruthy();
      expect(d).toMatchObject({ status: 'Disputed', verdict: null, closeReason: null, payment: { status: 'secured', settledAt: null } });
    });

  it('health odpowiada od razu i nie czeka na wyrocznię', async () => {
    const t0 = Date.now();
    const h = await (await fetch(`${be.url}/api/health`)).json();
    expect(Date.now() - t0).toBeLessThan(300);
    expect(h).toMatchObject({ ok: true, db: 'ok' });
    expect(String(h.ai)).toMatch(/^http/);
  });
});
