import { MediaUploadSchema, type MediaUpload } from '@unbox/shared';
import { clientError } from './errors';
import type { Http } from './http';

/**
 * Źródło pliku do wysłania.
 * - `file`: React Native — plik z dysku (np. z CameraView.recordAsync). FormData z { uri, name, type }
 *   wysyła go natywnie, bez ładowania wideo do JS jako base64.
 * - `blob`: web i testy.
 */
export type UploadSource =
  | { kind: 'file'; uri: string; name: string; mimeType: string }
  | { kind: 'blob'; blob: Blob; name: string };

export const mediaApi = (http: Http) => ({
  /**
   * Wysyła zdjęcie albo nagranie (POST /api/media). Serwer liczy sha256 w locie.
   * Jeśli aplikacja policzyła hash wcześniej (`expectedSha256`), sprawdzamy zgodność.
   */
  async upload(src: UploadSource, opts: { expectedSha256?: string } = {}): Promise<MediaUpload> {
    const form = new FormData();
    if (src.kind === 'file') form.append('file', { uri: src.uri, name: src.name, type: src.mimeType } as unknown as Blob);
    else form.append('file', src.blob, src.name);
    const r = await http.request(MediaUploadSchema, 'POST', '/api/media', { form, upload: true });
    if (opts.expectedSha256 && opts.expectedSha256 !== r.sha256) throw clientError('HASH_MISMATCH');
    return r;
  },
  /** Publiczny adres pliku (np. do odtworzenia nagrania albo pokazania zdjęcia). */
  url: (sha256: string) => `${http.baseUrl}/media/${sha256}`,
});
