import { sha256Hex } from "./hash.ts";
import type { EvidenceAuthor, EvidenceCheck, EvidenceItem } from "./report.ts";

// metadata.json written by the seller app (docs/zadania/README.md, ListingMetadata).
export interface ListingMetadata {
  v: 1;
  title: string;
  description: string;
  brand: string;
  size: string;
  condition: string;
  defects: string[];
  photos: { path: string; sha256: string }[];
}

// complaint.json written by the buyer app (Complaint).
export interface Complaint {
  v: 1;
  category: string;
  description: string;
  created_at: string;
}

// Hashes as committed on-chain in the Deal account, hex-encoded.
export interface DealRefs {
  deal: string; // base58 pubkey of the Deal PDA
  metadataUri: string;
  listingHash: string;
  packingVideoHash: string;
  unboxingVideoHash: string;
  complaintHash: string;
  trackingNumber: string;
}

export interface EvidenceBundle {
  check: EvidenceCheck;
  metadata: ListingMetadata | null;
  complaint: Complaint | null;
  photos: { path: string; bytes: Uint8Array }[];
  packing: Uint8Array | null;
  unboxing: Uint8Array | null;
}

// Returns file bytes or null when the file does not exist / cannot be downloaded.
// `ref` is either a full URL or a storage path inside the bucket.
export type FetchBytes = (ref: string) => Promise<Uint8Array | null>;

export const dealPaths = (deal: string) => ({
  packing: `deals/${deal}/packing.mp4`,
  unboxing: `deals/${deal}/unboxing.mp4`,
  complaint: `deals/${deal}/complaint.json`,
  report: `deals/${deal}/report.json`,
});

function parseJson<T>(bytes: Uint8Array | null): T | null {
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function isMetadata(m: unknown): m is ListingMetadata {
  const x = m as ListingMetadata;
  return (
    typeof x === "object" && x !== null &&
    Array.isArray(x.defects) && Array.isArray(x.photos) &&
    x.photos.every((p) => typeof p?.path === "string" && typeof p?.sha256 === "string")
  );
}

function isComplaint(c: unknown): c is Complaint {
  const x = c as Complaint;
  return typeof x === "object" && x !== null && typeof x.description === "string";
}

// Downloads every piece of evidence and compares sha256 of the exact downloaded bytes
// with the on-chain commitments. Never re-serializes JSON before hashing.
export async function collectEvidence(refs: DealRefs, fetchBytes: FetchBytes): Promise<EvidenceBundle> {
  const items: EvidenceItem[] = [];
  const check = async (path: string, author: EvidenceAuthor, expected: string) => {
    const bytes = await fetchBytes(path);
    const actual = bytes ? sha256Hex(bytes) : null;
    items.push({ path, author, expected_sha256: expected.toLowerCase(), actual_sha256: actual, ok: actual === expected.toLowerCase() });
    return actual === expected.toLowerCase() ? bytes : null;
  };
  const p = dealPaths(refs.deal);

  const metadataBytes = await check(refs.metadataUri, "seller", refs.listingHash);
  const metadataRaw = parseJson<unknown>(metadataBytes);
  const metadata = isMetadata(metadataRaw) ? metadataRaw : null;
  // Photo hashes live inside metadata.json, so listing_hash covers them too.
  const photos: EvidenceBundle["photos"] = [];
  for (const photo of metadata?.photos ?? []) {
    const bytes = await check(photo.path, "seller", photo.sha256);
    if (bytes) photos.push({ path: photo.path, bytes });
  }
  const packing = await check(p.packing, "seller", refs.packingVideoHash);
  const unboxing = await check(p.unboxing, "buyer", refs.unboxingVideoHash);
  const complaintBytes = await check(p.complaint, "buyer", refs.complaintHash);
  const complaintRaw = parseJson<unknown>(complaintBytes);
  const complaint = isComplaint(complaintRaw) ? complaintRaw : null;

  const authorOk = (a: EvidenceAuthor) => items.filter((i) => i.author === a).every((i) => i.ok);
  return {
    check: {
      items,
      // A file with a matching hash but unusable content still counts against its author.
      seller_ok: authorOk("seller") && metadata !== null,
      buyer_ok: authorOk("buyer") && complaint !== null,
    },
    metadata,
    complaint,
    photos,
    packing,
    unboxing,
  };
}
