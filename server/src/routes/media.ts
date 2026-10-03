// Pliki adresowane haszem: POST /api/media (zdjęcia i nagrania), GET /media/:sha256 (publicznie, każdy może sprawdzić hasz).
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { MediaUploadSchema } from '@unbox/shared';
import { type AuthEnv, requireAuth } from '../auth';
import { config, paths } from '../config';
import { media } from '../db';
import { ApiErr, send } from '../errors';
import { commitUpload, receiveUpload } from '../upload';

export const mediaApiRoutes = new Hono<AuthEnv>();
export const mediaPublicRoutes = new Hono();

const ALLOWED = /^(image\/(jpeg|png|webp|heic)|video\/(mp4|quicktime))$/;

mediaApiRoutes.post('/media', requireAuth, async (c) => {
  const u = await receiveUpload(c, 'file');
  if (!ALLOWED.test(u.mimeType)) {
    fs.rmSync(u.tmpPath, { force: true });
    throw new ApiErr('VALIDATION', `Niedozwolony typ pliku: ${u.mimeType}`);
  }
  commitUpload(u, paths.media, u.sha256);
  media.insert(u.sha256, u.mimeType, u.size, c.get('user').id);
  return send(c, MediaUploadSchema, { sha256: u.sha256, url: `${config.publicBaseUrl}/media/${u.sha256}`, size: u.size, mimeType: u.mimeType }, 201);
});

mediaPublicRoutes.get('/media/:sha256', (c) => {
  const sha = c.req.param('sha256');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ApiErr('VALIDATION', 'Oczekiwano sha256 (hex)');
  const m = media.get(sha);
  const file = path.join(paths.media, sha);
  if (!m || !fs.existsSync(file)) throw new ApiErr('NOT_FOUND', 'Nie ma takiego pliku');
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: { 'Content-Type': m.mimeType, 'Content-Length': String(m.size), 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});
