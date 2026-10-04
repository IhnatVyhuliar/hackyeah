// sha256 of a local file in 1 MiB chunks: a 2-min video never sits in JS memory as one string.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';

const CHUNK = 1 << 20;

export async function hashFile(uri: string): Promise<string> {
  const h = sha256.create();
  const handle = new File(uri).open();
  try {
    for (;;) {
      const bytes = handle.readBytes(CHUNK);
      if (bytes.length === 0) break;
      h.update(bytes);
    }
  } finally {
    handle.close();
  }
  return bytesToHex(h.digest());
}
