import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ApiError, createApi } from './client';

test('unreachable server gives a NETWORK ApiError with the address in Polish', async () => {
  const api = createApi('http://127.0.0.1:9');            // port 9: nothing listens
  await assert.rejects(api.get('/api/health'), (e: unknown) =>
    e instanceof ApiError && e.code === 'NETWORK' && e.message.includes('127.0.0.1:9'));
});

test('server error JSON becomes ApiError with its code and Polish message; the token goes as Bearer', async () => {
  let auth: string | undefined;
  const srv = createServer((req, res) => {
    auth = req.headers.authorization;
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'INVALID_STATE', message: 'Stan się zmienił' } }));
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as { port: number };
  try {
    const api = createApi(`http://127.0.0.1:${port}/`);
    api.setToken('t0k');
    await assert.rejects(api.post('/api/deals/x/accept', { qrSecret: 'a' }), (e: unknown) =>
      e instanceof ApiError && e.status === 409 && e.code === 'INVALID_STATE' && e.message === 'Stan się zmienił');
    assert.equal(auth, 'Bearer t0k');
    assert.equal(api.mediaUrl('ab'), `http://127.0.0.1:${port}/media/ab`);
  } finally {
    srv.close();
  }
});
