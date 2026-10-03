// Publiczne pliki: /media/:sha256 (każdy może sprawdzić hasz nagrania z łańcucha) i /files/:name.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { paths } from '../config';
import { ApiErr } from '../errors';

export const mediaRoutes = new Hono();

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic',
};

function serve(file: string) {
  if (!fs.existsSync(file)) throw new ApiErr('NOT_FOUND', 'Nie ma takiego pliku');
  const { size } = fs.statSync(file);
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
    headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
               'Content-Length': String(size), 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

mediaRoutes.get('/media/:sha256', (c) => {
  const sha = c.req.param('sha256').replace(/\.mp4$/, '');
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ApiErr('VALIDATION', 'Oczekiwano sha256 (hex)');
  return serve(path.join(paths.media, `${sha}.mp4`));
});

mediaRoutes.get('/files/:name', (c) => {
  const name = c.req.param('name');
  if (!/^[\w.-]+$/.test(name) || name.includes('..')) throw new ApiErr('VALIDATION', 'Niepoprawna nazwa pliku');
  return serve(path.join(paths.files, name));
});
