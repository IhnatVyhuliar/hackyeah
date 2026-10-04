// Smoke of the REST client against a running server/ (PAYMENTS=demo). Run from the repo root:
//   EXPO_PUBLIC_API_URL=http://localhost:4100 node --import tsx app/scripts/api-smoke.ts
import assert from 'node:assert/strict';
import { ApiError, api, deals, listings, login, wallet } from '../src/api';

// app/ is CommonJS for tsx, so no top-level await.
async function main() {
  const r = await login('bartek@demo.pl', 'demo1234');
  console.log('user', r.user.id);
  console.log('listings', (await listings()).length);
  console.log('balanceMinor', (await wallet()).balanceMinor);
  console.log('buyer deals', (await deals('buyer')).length);
  await assert.rejects(api.get('/api/nie-ma'), (e: unknown) => e instanceof ApiError && e.code === 'NOT_FOUND');
  console.log('ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
