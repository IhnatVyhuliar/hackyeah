// Jedyne miejsce z fetch(). JSON, multipart, token, timeout i mapowanie błędów na ApiClientError.
import type { z } from 'zod';
import { ApiClientError, clientError, errorFrom } from './errors';

export interface TokenStore {
  get(): string | null | Promise<string | null>;
  set(token: string | null): void | Promise<void>;
}

export const memoryTokenStore = (): TokenStore => {
  let t: string | null = null;
  return { get: () => t, set: (v) => { t = v; } };
};

export interface HttpOptions {
  /** Np. process.env.EXPO_PUBLIC_API_URL (bez końcowego /). */
  baseUrl: string;
  /** W aplikacji: magazyn oparty o expo-secure-store; domyślnie pamięć. */
  tokenStore?: TokenStore;
  timeoutMs?: number;
  uploadTimeoutMs?: number;
  /** Wywoływane po 401 (token wygasł) — np. przejście do ekranu logowania. */
  onUnauthorized?: () => void;
  /** Walidacja odpowiedzi schematami z @unbox/shared (domyślnie włączona). */
  validate?: boolean;
  fetch?: typeof fetch;
}

export interface RequestInit2 {
  body?: unknown; form?: FormData; query?: Record<string, string | undefined>; auth?: boolean; upload?: boolean;
  headers?: Record<string, string>;
}

export function createHttp(o: HttpOptions) {
  const baseUrl = o.baseUrl.replace(/\/$/, '');
  const tokens = o.tokenStore ?? memoryTokenStore();
  const doFetch = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const validate = o.validate ?? true;

  async function request<S extends z.ZodType>(schema: S, method: string, path: string, i: RequestInit2 = {}): Promise<z.infer<S>> {
    const qs = i.query ? Object.entries(i.query).filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v!)}`).join('&') : '';
    const headers: Record<string, string> = { Accept: 'application/json', ...i.headers };
    if (i.auth !== false) {
      const t = await tokens.get();
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    if (i.body !== undefined) headers['Content-Type'] = 'application/json';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), i.upload ? (o.uploadTimeoutMs ?? 300_000) : (o.timeoutMs ?? 20_000));
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}${qs ? `?${qs}` : ''}`, {
        method, headers, signal: ctrl.signal,
        body: i.form ?? (i.body !== undefined ? JSON.stringify(i.body) : undefined),
      });
    } catch (e) {
      throw clientError(ctrl.signal.aborted ? 'TIMEOUT' : 'NETWORK');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text().catch(() => '');
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* nie-JSON (np. strona błędu proxy) */ }
    if (!res.ok) {
      const err = errorFrom(res.status, json);
      if (err.code === 'UNAUTHORIZED' && i.auth !== false) { await tokens.set(null); o.onUnauthorized?.(); }
      throw err;
    }
    if (!validate) return json as z.infer<S>;
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw clientError('INVALID_RESPONSE', `Nieoczekiwana odpowiedź serwera (${method} ${path})`);
    return parsed.data;
  }

  return { request, tokens, baseUrl };
}

export type Http = ReturnType<typeof createHttp>;
export { ApiClientError };
