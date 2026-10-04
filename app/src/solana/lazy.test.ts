import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EscrowError, isEscrowError, type Escrow } from '@unbox/shared';
import { lazyEscrow } from './lazy';

const fake = (over: Partial<Escrow> = {}): Escrow => ({
  mode: 'solana', walletAddress: async () => 'Addr', networkNow: async () => 1,
  ...over,
} as Escrow);

test('mode is there before the wallet loads', () => {
  let calls = 0;
  const e = lazyEscrow(async () => { calls++; return fake(); });
  assert.equal(e.mode, 'solana');
  assert.equal(calls, 0);
});

test('init runs once and calls pass through', async () => {
  let calls = 0;
  const e = lazyEscrow(async () => {
    calls++;
    return fake({ settleExpired: async (k) => ({ signature: k.deal, explorerUrl: null }) });
  });
  const [a, r] = await Promise.all([e.walletAddress(), e.settleExpired({ id: '1', deal: 'Deal1' }), e.networkNow()]);
  assert.equal(a, 'Addr');
  assert.deepEqual(r, { signature: 'Deal1', explorerUrl: null });
  assert.equal(calls, 1);
});

test('a failed init rejects with EscrowError and is retried', async () => {
  let calls = 0;
  const e = lazyEscrow(async () => {
    calls++;
    if (calls === 1) throw new Error('SecureStore unavailable');
    return fake();
  });
  await assert.rejects(e.walletAddress(), (err) => isEscrowError(err) && !/SecureStore/.test(err.message));
  assert.equal(await e.walletAddress(), 'Addr');
  assert.equal(calls, 2);
});

test('EscrowError from init keeps its code and Polish message', async () => {
  const e = lazyEscrow(async () => { throw new EscrowError('Rejected', 'Brak weryfikatora.'); });
  await assert.rejects(e.purchase({ id: '1', deal: 'D' }), { code: 'Rejected', message: 'Brak weryfikatora.' });
});
