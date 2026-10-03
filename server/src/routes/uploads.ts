import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  DemoScenarioSchema, MarkersSchema, nowUnix, type Order, UploadResultSchema, type Verification,
  VideoUploadResponseSchema,
} from '@sellsol/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { config, paths } from '../config';
import { docs } from '../db';
import { ApiErr, parse, send } from '../errors';
import { addTimeline, ai, getOrder, roleIn, saveOrder, syncOrder } from '../orders';
import { commitUpload, receiveUpload, type SavedUpload } from '../upload';

export const uploadRoutes = new Hono<AuthEnv>();

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

uploadRoutes.post('/uploads', requireAuth, async (c) => {
  const u = await receiveUpload(c, 'file');
  const ext = IMAGE_EXT[u.mimeType] ?? (path.extname(u.filename).slice(1).toLowerCase() || 'bin');
  const name = `${u.sha256}.${ext}`;
  commitUpload(u, paths.files, name);
  return send(c, UploadResultSchema, { url: `${config.publicBaseUrl}/files/${name}`, sha256: u.sha256, size: u.size, mimeType: u.mimeType }, 201);
});

function parseMarkers(u: SavedUpload) {
  try {
    return parse(MarkersSchema, u.fields.markers ? JSON.parse(u.fields.markers) : {});
  } catch (e) {
    fs.rmSync(u.tmpPath, { force: true });
    throw e instanceof ApiErr ? e : new ApiErr('VALIDATION', 'markers: niepoprawny JSON');
  }
}

/** Analiza w tle: Verification processing → done/failed. AI tylko mierzy. */
function analyzeInBackground(v: Verification, run: () => Promise<Verification['report']>) {
  void run().then(
    (report) => docs.put('verification', v.id, { ...v, status: 'done', report }),
    (e: Error) => docs.put('verification', v.id, { ...v, status: 'failed', error: e.message }),
  ).then((done) => {
    const o = docs.get('order', v.orderId);
    if (!o) return;
    const label = done.status === 'failed'
      ? `Analiza AI nie powiodła się: ${done.error}`
      : v.kind === 'packing'
        ? (done.report?.packingOk ? 'AI: nagranie pakowania poprawne' : 'AI: uwagi do nagrania pakowania (raport doradczy)')
        : (done.report?.recordingValid ? 'AI: nagranie otwarcia ważne, można zgłosić wynik' : 'AI: nagranie otwarcia nieważne, nagraj ponownie');
    addTimeline(o, `${v.kind}_${done.status}`, label);
    saveOrder(o);
  });
}

async function receiveVideo(c: Parameters<typeof receiveUpload>[0], o: Order) {
  const u = await receiveUpload(c, 'video');
  const markers = parseMarkers(u);
  const file = commitUpload(u, paths.media, `${u.sha256}.mp4`);
  const v: Verification = { id: `v-${randomUUID()}`, orderId: o.id, kind: 'packing', status: 'processing', report: null, createdAt: nowUnix() };
  return { u, markers, file, v };
}

uploadRoutes.post('/orders/:id/packing-video', requireAuth, async (c) => {
  const user = c.get('user');
  const o = await syncOrder(getOrder(c.req.param('id')));
  if (roleIn(o, user.id) !== 'seller') throw new ApiErr('FORBIDDEN', 'Nagranie pakowania wysyła sprzedający');
  if (o.chainStatus !== 'Funded') throw new ApiErr('INVALID_STATE', 'Zamówienie nie jest w stanie Funded');
  if (!o.seal) throw new ApiErr('INVALID_STATE', 'Najpierw wygeneruj plombę');
  const { u, markers, file, v } = await receiveVideo(c, o);
  docs.put('verification', v.id, v);
  const fresh = getOrder(o.id);
  fresh.packingVideoHash = u.sha256;
  fresh.packingVerificationId = v.id;
  addTimeline(fresh, 'packing_uploaded', 'Sprzedający przesłał nagranie pakowania, AI sprawdza');
  await syncOrder(fresh);
  analyzeInBackground(v, () => ai.analyzePacking({ order: fresh, videoPath: file, videoSha256: u.sha256, markers }));
  return send(c, VideoUploadResponseSchema, { verificationId: v.id, videoSha256: u.sha256 }, 202);
});

uploadRoutes.post('/orders/:id/unboxing-video', requireAuth, async (c) => {
  const user = c.get('user');
  const o = await syncOrder(getOrder(c.req.param('id')));
  if (roleIn(o, user.id) !== 'buyer') throw new ApiErr('FORBIDDEN', 'Nagranie otwarcia wysyła kupujący');
  if (o.chainStatus !== 'Shipped') throw new ApiErr('INVALID_STATE', 'Zamówienie nie jest w stanie Shipped');
  const header = c.req.header('X-Demo-Scenario');
  const scenario = config.ai === 'mock' && header ? parse(DemoScenarioSchema, header) : undefined;
  const { u, markers, file, v: base } = await receiveVideo(c, o);
  const v: Verification = { ...base, kind: 'unboxing' };
  docs.put('verification', v.id, v);
  const fresh = getOrder(o.id);
  fresh.unboxingVerificationId = v.id;
  fresh.unboxingVideoHash = u.sha256;
  addTimeline(fresh, 'unboxing_uploaded', 'Kupujący przesłał nagranie otwarcia, AI sprawdza');
  await syncOrder(fresh);
  analyzeInBackground(v, () => ai.analyzeUnboxing({ order: fresh, videoPath: file, videoSha256: u.sha256, markers, scenario }));
  return send(c, VideoUploadResponseSchema, { verificationId: v.id, videoSha256: u.sha256 }, 202);
});
