// REST client for server/. Error shape: { error: { code, message } } with a Polish message.
import type { MediaUpload } from '@unbox/shared';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApi(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '');
  let token: string | null = null;

  async function request<T>(method: string, path: string, body?: unknown, form?: FormData, extra: Record<string, string> = {}): Promise<T> {
    const headers: Record<string, string> = { ...extra };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(base + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    } catch {
      throw new ApiError(0, 'NETWORK', `Brak połączenia z serwerem ${base}. Sprawdź Wi-Fi i adres EXPO_PUBLIC_API_URL.`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? `Serwer odpowiedział ${res.status}.`);
    return json as T;
  }

  return {
    base,
    setToken: (t: string | null) => { token = t; },
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, undefined, headers),
    put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
    /** Multipart upload of a local file (React Native: { uri, name, type }). */
    uploadFile: (uri: string, mimeType: string, name: string) => {
      const form = new FormData();
      form.append('file', { uri, name, type: mimeType } as unknown as Blob);
      return request<MediaUpload>('POST', '/api/media', undefined, form);
    },
    /** Same upload from a Blob (web and Node scripts). The Blob's type must be the bare MIME type. */
    uploadBlob: (blob: Blob, name: string) => {
      const form = new FormData();
      form.append('file', blob, name);
      return request<MediaUpload>('POST', '/api/media', undefined, form);
    },
    mediaUrl: (sha: string) => `${base}/media/${sha}`,
  };
}

export type Api = ReturnType<typeof createApi>;
export const api = createApi(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000');
