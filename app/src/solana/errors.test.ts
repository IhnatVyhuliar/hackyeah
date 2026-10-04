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

test('no raw English leaks into messages', () => {
  const raw = toEscrowError(new Error('Account does not exist or has no data X'));
  assert.equal(raw.code, 'Rejected');
  assert.doesNotMatch(raw.message, /Account|exist|data|X$/);
  assert.match(toEscrowError(anchorErr('StringTooLong')).message, /Numer przesyłki/);
  assert.match(toEscrowError(anchorErr('EmptyText')).message, /Numer przesyłki/);
  const unknown = toEscrowError(anchorErr('SomethingNew'));
  assert.doesNotMatch(unknown.message, /SomethingNew/);
  assert.equal(unknown.code, 'Rejected');
});

test('an instruction the deployed program does not have yet says so, instead of a generic rejection', () => {
  for (const e of [anchorErr('NotImplemented'), anchorErr('InstructionFallbackNotFound'),
    { message: 'Simulation failed', logs: ['Program log: AnchorError occurred. Error Code: InstructionFallbackNotFound. Error Number: 101.'] }]) {
    const x = toEscrowError(e);
    assert.equal(x.code, 'Rejected');
    assert.match(x.message, /nie obsługuje jeszcze/);
  }
});
