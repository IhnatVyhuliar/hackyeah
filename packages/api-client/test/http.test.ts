// Klient HTTP bez serwera: mapowanie błędów, token, timeout, brak sieci, walidacja odpowiedzi.
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, createUnboxApi, memoryTokenStore } from '../src';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = { id: 'u-1', email: 'a@b.pl', name: 'A', createdAt: 1 };

function api(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, extra = {}) {
  const tokenStore = memoryTokenStore();
  return { tokenStore, api: createUnboxApi({ baseUrl: 'http://x/', tokenStore, fetch: fetchImpl as typeof fetch, timeoutMs: 50, ...extra }) };
}

const codeOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { return [(e as ApiClientError).code, (e as ApiClientError).message]; } return ['OK']; };

describe('http', () => {
  it('login zapisuje token i dokłada go do kolejnych żądań', async () => {
    const seen: (string | null)[] = [];
    const { api: a } = api(async (url, init) => {
      seen.push(new Headers(init.headers).get('Authorization'));
      return url.endsWith('/login') ? json(200, { token: 'T', user }) : json(200, user);
    });
    await a.auth.login({ email: 'a@b.pl', password: 'x' });
    await a.auth.me();
    expect(seen).toEqual([null, 'Bearer T']);
  });

  it('błędy 400/403/404/409/500 → kod i polski komunikat', async () => {
    const cases: [number, unknown, string, string][] = [
      [409, { error: { code: 'QR_MISMATCH', message: 'Kod QR nie pasuje do tej przesyłki' } }, 'QR_MISMATCH', 'Kod QR nie pasuje do tej przesyłki'],
      [403, { error: { code: 'FORBIDDEN', message: 'Tę akcję wykonuje kupujący' } }, 'FORBIDDEN', 'Tę akcję wykonuje kupujący'],
      [404, null, 'NOT_FOUND', 'Nie znaleziono'],
      [400, { error: { code: 'VALIDATION', message: 'title: za krótki' } }, 'VALIDATION', 'title: za krótki'],
      [500, '<html>Bad gateway</html>', 'INTERNAL', 'Błąd serwera, spróbuj ponownie'],
      [409, {}, 'INVALID_STATE', 'Ta akcja nie jest teraz możliwa'],
    ];
    for (const [status, body, code, message] of cases) {
      const { api: a } = api(async () => (typeof body === 'string' ? new Response(body, { status }) : json(status, body)));
      expect(await codeOf(a.deals.get('d'))).toEqual([code, message]);
    }
  });

  it('401 czyści token i woła onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const { api: a, tokenStore } = api(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'Nieprawidłowy albo wygasły token' } }), { onUnauthorized });
    tokenStore.set('stary');
    expect((await codeOf(a.auth.me()))[0]).toBe('UNAUTHORIZED');
    expect(tokenStore.get()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('brak sieci, timeout, niezgodna odpowiedź', async () => {
    expect(await codeOf(api(async () => { throw new TypeError('fetch failed'); }).api.auth.me()))
      .toEqual(['NETWORK', 'Brak połączenia z serwerem']);
    const hang = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) =>
      init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    expect((await codeOf(api(hang).api.auth.me()))[0]).toBe('TIMEOUT');
    expect((await codeOf(api(async () => json(200, { id: 1 })).api.auth.me()))[0]).toBe('INVALID_RESPONSE');
  });

  it('upload: multipart z plikiem i kontrola hasha', async () => {
    let form: FormData | null = null;
    const sha = 'a'.repeat(64);
    const { api: a } = api(async (_u, init) => { form = init.body as FormData; return json(201, { sha256: sha, url: 'http://x/media/a', size: 3, mimeType: 'video/mp4' }); });
    const r = await a.media.upload({ kind: 'blob', blob: new Blob(['abc'], { type: 'video/mp4' }), name: 'v.mp4' }, { expectedSha256: sha });
    expect(r.sha256).toBe(sha);
    expect((form!.get('file') as File).name).toBe('v.mp4');
    expect((await codeOf(a.media.upload({ kind: 'blob', blob: new Blob(['abc']), name: 'v.mp4' }, { expectedSha256: 'b'.repeat(64) })))[0])
      .toBe('HASH_MISMATCH');
  });
});
