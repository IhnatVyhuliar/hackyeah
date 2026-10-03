// Upload mediów (bez zaufania do klienta) i trwałość danych (restart, idempotentny seed, tryb produkcyjny).
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaUploadSchema } from '@unbox/shared';
import { as, type Backend, codeOf, listing, startBackend } from './harness';

let be: Backend;
let token: string;
beforeAll(async () => {
  be = await startBackend({ MAX_UPLOAD_MB: '0.05' });       // ok. 52 KB, żeby sprawdzić limit
  token = (await (await fetch(`${be.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ania@demo.pl', password: 'demo1234' }) })).json()).token;
});
afterAll(() => be?.stop());

async function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  const r = await fetch(`${be.url}/api/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body });
  return { status: r.status, json: await r.json() };
}
const form = (parts: [string, Blob | string, string?][]) => {
  const f = new FormData();
  for (const [k, v, name] of parts) typeof v === 'string' ? f.append(k, v) : f.append(k, v, name);
  return f;
};
const bytes = (n: number) => new Uint8Array(randomBytes(n));

describe('media', () => {
  it('hash liczy serwer, nazwa pliku od klienta jest ignorowana, plik wraca bajt w bajt', async () => {
    const data = bytes(4096);
    const r = await post(form([['file', new Blob([data], { type: 'video/mp4' }), '../../etc/passwd.mp4']]));
    expect(r.status).toBe(201);
    const m = MediaUploadSchema.parse(r.json);
    expect(m.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    expect(m.url).toBe(`${be.url}/media/${m.sha256}`);
    const got = await fetch(m.url);
    expect(got.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await got.arrayBuffer()).equals(Buffer.from(data))).toBe(true);
    // ponowny upload tych samych bajtów: ten sam identyfikator, plik nie jest nadpisywany
    const again = await post(form([['file', new Blob([data], { type: 'video/mp4' }), 'inna-nazwa.mp4']]));
    expect(again).toMatchObject({ status: 201, json: { sha256: m.sha256 } });
  });

  it.each([
    ['brak pliku', () => post(form([['markers', '{}']])), 400],
    ['nie multipart', () => post(JSON.stringify({ a: 1 }), { 'Content-Type': 'application/json' }), 400],
    ['multipart bez boundary', () => post('xxx', { 'Content-Type': 'multipart/form-data' }), 400],
    ['uszkodzony multipart', () => post('--b\r\nContent-Disposition: form-data; name="file"; filename="a"\r\n\r\nabc', { 'Content-Type': 'multipart/form-data; boundary=b' }), 400],
    ['pusty plik', () => post(form([['file', new Blob([], { type: 'video/mp4' }), 'a.mp4']])), 400],
    ['niedozwolony typ', () => post(form([['file', new Blob([bytes(100)], { type: 'text/html' }), 'a.html']])), 400],
    ['za duży plik', () => post(form([['file', new Blob([bytes(200_000)], { type: 'video/mp4' }), 'a.mp4']])), 413],
  ] as const)('%s → odrzucone z błędem w formacie API', async (_n, run, status) => {
    const r = await run();
    expect(r.status).toBe(status);
    expect(r.json).toMatchObject({ error: { code: 'VALIDATION', message: expect.any(String) } });
  });

  it('ten sam plik wgrany przez dwie osoby może użyć każda z nich (i tylko one)', async () => {
    const data = bytes(2048);
    const ania = await as(be.url, 'ania@demo.pl'), celina = await as(be.url, 'celina@demo.pl'), bartek = await as(be.url, 'bartek@demo.pl');
    const a = await ania.media.upload({ kind: 'blob', blob: new Blob([data], { type: 'image/jpeg' }), name: 'p.jpg' });
    const c = await celina.media.upload({ kind: 'blob', blob: new Blob([data], { type: 'image/jpeg' }), name: 'p.jpg' });
    expect(c.sha256).toBe(a.sha256);
    const input = { title: 'Wspólne zdjęcie', description: '', categoryId: 'inne', condition: 'dobry' as const, brand: '', size: '',
      defects: [], photos: [{ url: a.url, sha256: a.sha256 }], priceMinor: 100 };
    expect(await codeOf(celina.listings.create(input))).toBe('OK');
    expect(await codeOf(bartek.listings.create(input))).toBe('VALIDATION');
  });

  it('GET /media: zły identyfikator 400, nieistniejący 404', async () => {
    expect((await fetch(`${be.url}/media/abc`)).status).toBe(400);
    expect((await fetch(`${be.url}/media/${'0'.repeat(64)}`)).status).toBe(404);
  });
});

describe('trwałość danych', () => {
  it('restart: dane i sesja zostają, seed się nie powtarza, salda bez zmian', async () => {
    const seller = await as(be.url, 'ania@demo.pl'), buyer = await as(be.url, 'bartek@demo.pl');
    const l = await listing(seller, 250);
    const deal = await buyer.flows.purchaseListing(l.id);
    const before = { w: await buyer.auth.wallet(), listings: await buyer.listings.list(), cats: await buyer.listings.categories() };
    await be.restart();
    await be.restart();
    expect((await buyer.deals.get(deal.id)).status).toBe('Paid');           // ten sam token działa po restarcie
    const w = await buyer.auth.wallet();
    expect(w.balanceMinor).toBe(before.w.balanceMinor);                     // brak ponownego doładowania kont demo
    expect(w.ledger).toHaveLength(before.w.ledger.length);
    expect((await buyer.listings.list()).map((x) => x.id)).toEqual(before.listings.map((x) => x.id));
    expect(await buyer.listings.categories()).toHaveLength(before.cats.length);
  });

  it('NODE_ENV=production: zegar testowy niedostępny nawet z ENABLE_DEV_CLOCK=1; bez JWT_SECRET serwer nie wstaje', async () => {
    const prod = await startBackend({ NODE_ENV: 'production', ENABLE_DEV_CLOCK: '1', JWT_SECRET: randomBytes(32).toString('hex') });
    try {
      const r = await fetch(`${prod.url}/api/dev/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"advanceSecs":1}' });
      expect(r.status).toBe(404);
    } finally { await prod.stop(); }
    await expect(startBackend({ NODE_ENV: 'production', JWT_SECRET: '' })).rejects.toThrow(/JWT_SECRET/);
  });
});

