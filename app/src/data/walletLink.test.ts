import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EscrowError, type User } from '@unbox/shared';
import { ApiError } from '../api/client';
import { linkWalletIfNeeded } from './walletLink';

const user = { id: 'u-bartek', email: 'b', name: 'B', createdAt: 1 } as User;

test('demo mode never touches the wallet', async () => {
  let calls = 0;
  const r = await linkWalletIfNeeded(user, { mode: 'demo', walletAddress: async () => { calls++; return 'X'; }, link: async () => { calls++; return user; } });
  assert.deepEqual([r.user, r.walletLinkError, calls], [user, null, 0]);
});

test('solana mode links a new address and skips an already linked one', async () => {
  const linked: string[] = [];
  const deps = { mode: 'solana' as const, walletAddress: async () => 'ADDR', link: async (a: string) => { linked.push(a); return { ...user, walletAddress: a }; } };
  const r = await linkWalletIfNeeded(user, deps);
  assert.deepEqual([r.user.walletAddress, r.walletLinkError, linked], ['ADDR', null, ['ADDR']]);
  await linkWalletIfNeeded({ ...user, walletAddress: 'ADDR' }, deps);
  assert.deepEqual(linked, ['ADDR']);
});

test('Review Focus 5: an address taken by another account or a wallet that cannot load becomes a message, not a crash', async () => {
  const taken = await linkWalletIfNeeded(user, { mode: 'solana', walletAddress: async () => 'ADDR',
    link: async () => { throw new ApiError(409, 'INVALID_STATE', 'Ten adres portfela jest już przypisany do innego konta.'); } });
  assert.deepEqual([taken.user, taken.walletLinkError], [user, 'Ten adres portfela jest już przypisany do innego konta.']);
  const broken = await linkWalletIfNeeded(user, { mode: 'solana',
    walletAddress: async () => { throw new EscrowError('Rejected', 'Aplikacja nie zna adresu weryfikatora.'); }, link: async () => user });
  assert.equal(broken.walletLinkError, 'Aplikacja nie zna adresu weryfikatora.');
});
