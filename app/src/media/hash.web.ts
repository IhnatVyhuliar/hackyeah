// Browser: the recording is a blob: URL; hash its bytes in 1 MiB steps.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const CHUNK = 1 << 20;

export async function hashBytes(bytes: Uint8Array): Promise<string> {
  const h = sha256.create();
  for (let i = 0; i < bytes.length; i += CHUNK) h.update(bytes.subarray(i, i + CHUNK));
  return bytesToHex(h.digest());
}

export async function hashFile(uri: string): Promise<string> {
  return hashBytes(new Uint8Array(await (await fetch(uri)).arrayBuffer()));
}
