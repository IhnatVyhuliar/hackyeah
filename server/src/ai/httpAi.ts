// AI=http: serwis Osoby 3 (KONTRAKT §10). Multipart, timeout 90 s, keyframe'y kopiowane pod /files/.
import fs from 'node:fs';
import path from 'node:path';
import { type VerificationReport, VerificationReportSchema } from '@sellsol/shared';
import { config, paths } from '../config';
import { ApiErr } from '../errors';
import type { AiAdapter, AnalyzeInput } from './types';

async function analyze(kind: 'packing' | 'unboxing', i: AnalyzeInput): Promise<VerificationReport> {
  const { order } = i;
  const form = new FormData();
  const buf = await fs.promises.readFile(i.videoPath);
  form.set('video', new Blob([buf], { type: 'video/mp4' }), `${i.videoSha256}.mp4`);
  form.set('order_id', order.id);
  // expected_qr: treść plomby zna tylko serwer (i sprzedający); AI porównuje ją z odczytem z wideo.
  form.set('expected_qr', order.seal?.qrPayload ?? '');
  form.set('markers', JSON.stringify(i.markers));
  form.set('listing_photos', JSON.stringify(order.listing.photos.map((p) => (p.startsWith('http') ? p : `${config.publicBaseUrl}${p}`))));
  form.set('extra_tests', JSON.stringify(order.listing.extraTests));
  if (kind === 'unboxing') {
    form.set('listing_description', `${order.listing.title}\n${order.listing.description}\nStan: ${order.listing.condition}`);
    if (order.packingVideoHash) form.set('packing_video_url', `${config.publicBaseUrl}/media/${order.packingVideoHash}`);
  }

  let res: Response;
  try {
    res = await fetch(`${config.aiUrl}/v1/analyze/${kind}`, { method: 'POST', body: form, signal: AbortSignal.timeout(config.aiTimeoutMs) });
  } catch (e) {
    throw new ApiErr('AI_ERROR', `Serwis AI niedostępny: ${(e as Error).message}`);
  }
  if (!res.ok) throw new ApiErr('AI_ERROR', `Serwis AI: HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 500));
  const parsed = VerificationReportSchema.safeParse(await res.json());
  if (!parsed.success) throw new ApiErr('AI_ERROR', `Raport AI niezgodny z kontraktem: ${parsed.error.issues[0]?.path.join('.')}`);
  const report = parsed.data;
  if (report.videoSha256 !== i.videoSha256)
    throw new ApiErr('AI_ERROR', `Raport dotyczy innego pliku (${report.videoSha256} ≠ ${i.videoSha256})`);

  report.keyframes = await Promise.all(report.keyframes.map(async (k, n) => {
    const url = k.url.startsWith('http') ? k.url : `${config.aiUrl}${k.url}`;
    const name = `kf-${order.id}-${kind}-${n}.jpg`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return k;
      await fs.promises.writeFile(path.join(paths.files, name), Buffer.from(await r.arrayBuffer()));
      return { ...k, url: `${config.publicBaseUrl}/files/${name}` };
    } catch { return k; }
  }));
  return report;
}

export const httpAi: AiAdapter = {
  kind: 'http',
  analyzePacking: (i) => analyze('packing', i),
  analyzeUnboxing: (i) => analyze('unboxing', i),
  async health() {
    try {
      const r = await fetch(`${config.aiUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const j = (await r.json()) as { ok?: boolean; llm?: string | null };
      return { ok: r.ok && j.ok !== false, llm: j.llm ?? null };
    } catch { return { ok: false, llm: null }; }
  },
};
