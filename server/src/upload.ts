// Strumieniowy odbiór multipart: zapis do pliku tymczasowego z liczeniem sha256 w locie.
// Nazwa pliku od klienta jest ignorowana; plik docelowy nazywa się swoim haszem.
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
  tmpPath: string; sha256: string; size: number; mimeType: string;
  fields: Record<string, string>;
}

const limitMb = () => Math.round(config.maxUploadBytes / 1024 / 1024);
const badMultipart = (detail?: string) => new ApiErr('VALIDATION', `Niepoprawne żądanie multipart${detail ? `: ${detail}` : ''}`);

export function receiveUpload(c: Context, fileField: string): Promise<SavedUpload> {
  const req = (c.env as { incoming?: IncomingMessage }).incoming;
  if (!req) throw new ApiErr('VALIDATION', 'Upload wymaga serwera Node');
  if (!c.req.header('content-type')?.startsWith('multipart/form-data'))
    throw new ApiErr('VALIDATION', 'Oczekiwano multipart/form-data');
  const declared = Number(c.req.header('content-length') ?? 0);
  if (declared > config.maxUploadBytes + 1024 * 1024)
    throw new ApiErr('VALIDATION', `Plik większy niż ${limitMb()} MB`, 413);

  return new Promise((resolve, reject) => {
    let bb: busboy.Busboy;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20 } });
    } catch (e) {
      return reject(badMultipart((e as Error).message));
    }
    const fields: Record<string, string> = {};
    let file: Promise<Omit<SavedUpload, 'fields'>> | null = null;
    let tmpPath: string | null = null;
    let failed = false;
    const fail = (e: unknown) => {
      if (failed) return;
      failed = true;
      if (tmpPath) fs.rm(tmpPath, { force: true }, () => {});
      req.unpipe(bb);
      req.resume();                                    // dociągamy resztę żądania, żeby wysłać odpowiedź
      reject(e instanceof ApiErr ? e : badMultipart());
    };

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('file', (name, stream, info) => {
      if (name !== fileField || file) { stream.resume(); return; }
      tmpPath = path.join(paths.tmp, randomUUID());
      const hash = createHash('sha256');
      let size = 0;
      const tap = new Transform({ transform(chunk, _e, cb) { hash.update(chunk); size += chunk.length; cb(null, chunk); } });
      stream.on('limit', () => fail(new ApiErr('VALIDATION', `Plik większy niż ${limitMb()} MB`, 413)));
      const target = tmpPath;
      file = pipeline(stream, tap, fs.createWriteStream(target)).then(() => {
        // Druga linia obrony: obcięty plik nigdy nie trafia do magazynu (hasz byłby hashem obciętej treści).
        if ((stream as unknown as { truncated?: boolean }).truncated) throw new ApiErr('VALIDATION', `Plik większy niż ${limitMb()} MB`, 413);
        return { tmpPath: target, sha256: hash.digest('hex'), size, mimeType: info.mimeType };
      });
      file.catch(fail);
    });
    bb.on('error', fail);
    bb.on('close', async () => {
      if (failed) return;
      if (!file) return fail(new ApiErr('VALIDATION', `Brak pliku w polu "${fileField}"`));
      try {
        const f = await file;
        if (failed) return;
        if (f.size === 0) return fail(new ApiErr('VALIDATION', 'Pusty plik'));
        resolve({ ...f, fields });
      } catch (e) { fail(e); }
    });
    req.on('aborted', () => fail(badMultipart('przerwane połączenie')));
    req.pipe(bb);
  });
}

/**
 * Przenosi plik do katalogu docelowego pod nazwą z haszem. Istniejący plik o tym haszu ma z definicji
 * tę samą treść, więc nigdy go nie nadpisujemy (usuwamy tylko plik tymczasowy).
 */
export function commitUpload(u: SavedUpload, dir: string, name: string): string {
  const dest = path.join(dir, name);
  if (fs.existsSync(dest)) fs.rmSync(u.tmpPath, { force: true });
  else fs.renameSync(u.tmpPath, dest);
  return dest;
}
