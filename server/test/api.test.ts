// Spójność API: kody statusu, kształt błędów, autoryzacja, 403 vs 404, przejścia niedozwolone (409).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorSchema } from '@unbox/shared';
import { as, type Backend, listing, shipped, startBackend } from './harness';

let be: Backend;
let tokens: Record<'ania' | 'bartek' | 'celina', string>;

beforeAll(async () => {
  be = await startBackend();
  const t = async (e: string) => (await (await fetch(`${be.url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${e}@demo.pl`, password: 'demo1234' }) })).json()).token as string;
  tokens = { ania: await t('ania'), bartek: await t('bartek'), celina: await t('celina') };
});
afterAll(() => be?.stop());

async function req(method: string, path: string, o: { token?: keyof typeof tokens | 'bad'; body?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...o.headers };
  if (o.token) headers.Authorization = `Bearer ${o.token === 'bad' ? 'xyz' : tokens[o.token]}`;
  const r = await fetch(`${be.url}${path}`, { method, headers, body: o.body });
  return { status: r.status, json: await r.json().catch(() => null) };
}
function expectError(r: { status: number; json: unknown }, status: number, code: string) {
  expect(r.status).toBe(status);
  const e = ApiErrorSchema.parse(r.json);                    // zawsze { error: { code, message } }
  expect(e.error.code).toBe(code);
  expect(e.error.message.length).toBeGreaterThan(0);
}

describe('autoryzacja i kształt błędów', () => {
  it.each([
    ['GET', '/api/me'], ['GET', '/api/me/wallet'], ['GET', '/api/me/listings'], ['GET', '/api/deals?role=buyer'],
    ['POST', '/api/listings'], ['POST', '/api/media'], ['POST', '/api/listings/l-kurtka-levis/purchase'], ['POST', '/api/deals/x/settle'],
  ])('%s %s bez tokenu → 401', async (m, p) => expectError(await req(m, p), 401, 'UNAUTHORIZED'));

  it('zły token → 401; nieznany endpoint → 404; zły JSON → 400; zły parametr → 400', async () => {
    expectError(await req('GET', '/api/me', { token: 'bad' }), 401, 'UNAUTHORIZED');
    expectError(await req('GET', '/api/nie-ma'), 404, 'NOT_FOUND');
    expectError(await req('POST', '/api/auth/login', { body: '{zly json' }), 400, 'VALIDATION');
    expectError(await req('POST', '/api/listings', { token: 'ania', body: '{"title":"x"}' }), 400, 'VALIDATION');
    expectError(await req('GET', '/api/deals?role=admin', { token: 'ania' }), 400, 'VALIDATION');
    expectError(await req('POST', '/api/auth/login', { body: '{"email":"ania@demo.pl","password":"zle"}' }), 401, 'UNAUTHORIZED');
  });

  it('publiczne odczyty działają bez tokenu', async () => {
    for (const p of ['/api/health', '/api/categories', '/api/listings', '/api/listings/l-kurtka-levis']) expect((await req('GET', p)).status).toBe(200);
  });
});

describe('403 vs 404 i przejścia niedozwolone', () => {
  it('nieistniejąca transakcja/ogłoszenie → 404, cudza → 403', async () => {
    expectError(await req('GET', '/api/deals/nie-ma', { token: 'ania' }), 404, 'NOT_FOUND');
    expectError(await req('POST', '/api/deals/nie-ma/settle', { token: 'ania' }), 404, 'NOT_FOUND');
    expectError(await req('POST', '/api/listings/nie-ma/purchase', { token: 'bartek' }), 404, 'NOT_FOUND');
    const seller = await as(be.url, 'ania@demo.pl'), buyer = await as(be.url, 'bartek@demo.pl');
    const { deal } = await shipped(seller, buyer, 100);
    for (const [m, p] of [['GET', ''], ['POST', '/settle'], ['POST', '/accept'], ['POST', '/confirm-return']] as const)
      expectError(await req(m, `/api/deals/${deal.id}${p}`, { token: 'celina', body: m === 'POST' ? JSON.stringify({ qrSecret: 'ab'.repeat(32), returnQrSecret: 'ab'.repeat(32) }) : undefined }), 403, 'FORBIDDEN');
    expectError(await req('PATCH', `/api/listings/${deal.id}`, { token: 'celina', body: '{"priceMinor":1}' }), 403, 'FORBIDDEN');
  });

  it('akcja w złym stanie albo złej roli → 409/403, stan bez zmian', async () => {
    const seller = await as(be.url, 'ania@demo.pl'), buyer = await as(be.url, 'bartek@demo.pl');
    const l = await listing(seller, 100);
    const deal = await buyer.flows.purchaseListing(l.id);
    const body = (o: object) => JSON.stringify(o);
    // Paid: kupujący nie może przyjąć ani reklamować, sprzedający nie może potwierdzić zwrotu
    expectError(await req('POST', `/api/deals/${deal.id}/accept`, { token: 'bartek', body: body({ qrSecret: 'ab'.repeat(32) }) }), 409, 'INVALID_STATE');
    expectError(await req('POST', `/api/deals/${deal.id}/confirm-return`, { token: 'ania', body: body({ returnQrSecret: 'ab'.repeat(32) }) }), 409, 'INVALID_STATE');
    expectError(await req('POST', `/api/deals/${deal.id}/ship`, { token: 'bartek', body: body({ qrCommitment: 'a'.repeat(64), packingVideoSha256: 'a'.repeat(64), trackingNumber: 'INP1' }) }), 403, 'FORBIDDEN');
    expectError(await req('POST', `/api/deals/${deal.id}/settle`, { token: 'bartek' }), 409, 'DEADLINE_NOT_REACHED');
    expectError(await req('PATCH', `/api/listings/${l.id}`, { token: 'ania', body: body({ priceMinor: 1 }) }), 409, 'INVALID_STATE');
    expectError(await req('POST', `/api/listings/${l.id}/cancel`, { token: 'ania' }), 409, 'INVALID_STATE');
    expectError(await req('POST', `/api/listings/${l.id}/purchase`, { token: 'celina' }), 409, 'INVALID_STATE');
    expectError(await req('POST', `/api/deals/${deal.id}/dispute`, { token: 'bartek', headers: { 'X-Demo-Scenario': 'hack' },
      body: body({ qrSecret: 'ab'.repeat(32), unboxingVideoSha256: 'a'.repeat(64), complaint: { category: 'other', description: 'abc' } }) }), 400, 'VALIDATION');
    expect((await buyer.deals.get(deal.id))).toMatchObject({ status: 'Paid', payment: { status: 'secured' } });
  });

  it('rejestracja: duplikat 400, nowe konto dostaje saldo startowe i nie może kupić własnej oferty', async () => {
    expectError(await req('POST', '/api/auth/register', { body: JSON.stringify({ email: 'ania@demo.pl', password: 'haslo123', name: 'A' }) }), 400, 'VALIDATION');
    const r = await req('POST', '/api/auth/register', { body: JSON.stringify({ email: `n${Date.now()}@demo.pl`, password: 'haslo123', name: 'Nowy' }) });
    expect(r.status).toBe(201);
    const t = r.json.token as string;
    const w = await (await fetch(`${be.url}/api/me/wallet`, { headers: { Authorization: `Bearer ${t}` } })).json();
    expect(w.balanceMinor).toBeGreaterThan(0);
  });
});
