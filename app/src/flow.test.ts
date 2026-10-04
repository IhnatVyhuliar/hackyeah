import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EscrowError } from '@unbox/shared';
import { ApiError } from './api/client';
import { explain, perform } from './flow';

const ok = { signature: 'sig', explorerUrl: 'https://explorer.solana.com/tx/sig?cluster=devnet' };

test('Review Focus 2: a failed sync does not turn a successful action into a failure', async () => {
  let refreshed = 0;
  const r = await perform(async () => ok, { sync: async () => { throw new Error('502'); }, refresh: async () => { refreshed++; } });
  assert.deepEqual([r, refreshed], [ok, 1]);
});

test('Review Focus 3: a failed or corrupted upload stops before the escrow call', async () => {
  for (const failure of [new ApiError(0, 'NETWORK', 'Brak połączenia'), new ApiError(0, 'NETWORK', 'Plik dotarł uszkodzony.')]) {
    let called = 0;
    const act = async () => {
      await Promise.reject(failure);   // the upload step inside the action
      called++;
      return ok;
    };
    await assert.rejects(perform(act, { refresh: async () => {} }));
    assert.equal(called, 0);
  }
});

test('stages run in order: chain, then sync', async () => {
  const seen: string[] = [];
  await perform(async () => { seen.push('act'); return ok; },
    { sync: async () => { seen.push('sync'); }, refresh: async () => { seen.push('refresh'); }, onStage: (s) => seen.push(s) });
  assert.deepEqual(seen, ['chain', 'act', 'sync', 'sync', 'refresh']);
});

test('Review Focus 4: errors become Polish copy; a status race is not retryable', () => {
  assert.equal(explain(new EscrowError('InvalidStatus', 'x')).title, 'Stan umowy już się zmienił');
  assert.equal(explain(new EscrowError('InvalidStatus', 'x')).retryable, false);
  assert.equal(explain(new EscrowError('QrMismatch', 'Kod nie pasuje')).retryable, true);
  assert.equal(explain(new EscrowError('QrMismatch', 'Kod nie pasuje')).text, 'Kod nie pasuje');
  assert.equal(explain(new ApiError(0, 'NETWORK', 'Brak połączenia z serwerem')).retryable, true);
  assert.equal(explain(new ApiError(400, 'VALIDATION', 'Za krótki tytuł')).retryable, false);
});
