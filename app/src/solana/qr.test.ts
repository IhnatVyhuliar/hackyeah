import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicKey } from '@solana/web3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeQr, parseQr, returnCommitment, shipCommitment } from './qr';

const deal = new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const secret = new Uint8Array(32).fill(0xab);

test('vectors from docs/zadania/README.md', () => {
  assert.equal(deal.toBase58(), '4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw');
  assert.equal(bytesToHex(shipCommitment(deal, secret)), '53c95ae0a78bfd76222068846946ee779ca3d184074836c3586cd0fa91ff7977');
  assert.equal(bytesToHex(returnCommitment(deal, secret)), '5e5f3dfadff170096733860b3fb82e2ce226c81a8103a67fc0bb850fff1b649d');
  assert.equal(encodeQr('ship', deal, secret), 'UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t');
  assert.equal(encodeQr('return', deal, secret), 'UNBOX1R:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:CZ8YUVdk7znjrUmnb5n7kgySk9yRAsQDYmyCxzfSky9t');
});

test('parse round-trips and rejects junk, demo-mode payloads and wrong lengths', () => {
  const p = parseQr(`  ${encodeQr('return', deal, secret)}\n`)!;
  assert.deepEqual([p.kind, p.deal.toBase58(), bytesToHex(p.secret)], ['return', deal.toBase58(), 'ab'.repeat(32)]);
  assert.equal(parseQr('UNBOX1:l-kurtka-levis:' + 'ab'.repeat(32)), null);   // demo format
  assert.equal(parseQr('https://example.com'), null);
  assert.equal(parseQr('UNBOX1:4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw:abc'), null);
});
