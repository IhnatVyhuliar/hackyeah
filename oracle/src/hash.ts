import { createHash } from "node:crypto";

export function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(bytes).digest();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// On-chain [u8; 32] → 64-char lowercase hex (team convention for JSON and logs).
export function toHex(bytes: ArrayLike<number>): string {
  return Buffer.from(Array.from(bytes)).toString("hex");
}
