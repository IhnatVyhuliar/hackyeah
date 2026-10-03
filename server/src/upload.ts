// Strumieniowy odbiór multipart: zapis na dysk z liczeniem sha256 w locie, limit 50 MB.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import busboy from 'busboy';
import type { Context } from 'hono';
import { config, paths } from './config';
import { ApiErr } from './errors';

export interface SavedUpload {
  tmpPath: string; sha256: string; size: number; mimeType: string; filename: string;
  fields: Record<string, string>;
}

export function receiveUpload(c: Context, fileField: string): Promise<SavedUpload> {
  const req = (c.env as { incoming?: IncomingMessage }).incoming;
  if (!req) throw new ApiErr('VALIDATION', 'Upload wymaga serwera Node');
  if (!c.req.header('content-type')?.startsWith('multipart/form-data'))
    throw new ApiErr('VALIDATION', 'Oczekiwano multipart/form-data');

  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: config.maxUploadBytes, files: 1 } });
    const fields: Record<string, string> = {};
    let file: Promise<Omit<SavedUpload, 'fields'>> | null = null;
    let failed = false;
    const fail = (e: unknown) => { if (!failed) { failed = true; reject(e); } };

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      if (name !== fileField) { stream.resume(); return; }
      const tmpPath = path.join(paths.tmp, randomUUID());
      const hash = createHash('sha256');
      let size = 0;
      const tap = new Transform({ transform(chunk, _e, cb) { hash.update(chunk); size += chunk.length; cb(null, chunk); } });
      stream.on('limit', () => fail(new ApiErr('VALIDATION', 'Plik większy niż 50 MB', 413)));
      file = pipeline(stream, tap, fs.createWriteStream(tmpPath)).then(() => {
        if (failed) { fs.rmSync(tmpPath, { force: true }); throw new Error('aborted'); }
        return { tmpPath, sha256: hash.digest('hex'), size, mimeType: info.mimeType, filename: info.filename };
      });
      file.catch(fail);
    });
    bb.on('error', fail);
    bb.on('close', async () => {
      if (failed) return;
      if (!file) return fail(new ApiErr('VALIDATION', `Brak pliku w polu "${fileField}"`));
      try { resolve({ ...(await file), fields }); } catch (e) { fail(e); }
    });
    req.pipe(bb);
  });
}

/** Przenosi plik do katalogu docelowego pod nazwą z haszem (idempotentnie). */
export function commitUpload(u: SavedUpload, dir: string, name: string): string {
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) fs.rmSync(u.tmpPath, { force: true });
  else fs.renameSync(u.tmpPath, dest);
  return dest;
}
