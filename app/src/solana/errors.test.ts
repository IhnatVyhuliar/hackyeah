import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toEscrowError } from './errors';

const anchorErr = (code: string) => ({ error: { errorCode: { code, number: 6000 }, errorMessage: 'x' } });

test('program errors map to Escrow codes with Polish copy', () => {
  assert.equal(toEscrowError(anchorErr('QrMismatch')).code, 'QrMismatch');
  assert.equal(toEscrowError(anchorErr('ListingHashMismatch')).code, 'ListingMismatch');
  assert.equal(toEscrowError(anchorErr('SameParty')).code, 'Rejected');
  assert.match(toEscrowError(anchorErr('DeadlineNotReached')).message, /zegar|czas sieci/i);
});

test('missing funds, expired blockhash and dead network', () => {
  assert.equal(toEscrowError({ message: 'Simulation failed', logs: ['Transfer: insufficient lamports 10, need 60000000'] }).code, 'InsufficientFunds');
  assert.equal(toEscrowError({ message: 'Attempt to debit an account but found no record of a prior credit.' }).code, 'InsufficientFunds');
  assert.equal(toEscrowError({ name: 'TransactionExpiredBlockheightExceededError', message: 'expired' }).code, 'Network');
  assert.equal(toEscrowError(new TypeError('Network request failed')).code, 'Network');
});
