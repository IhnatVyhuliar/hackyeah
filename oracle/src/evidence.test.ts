import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEvidence, type DealRefs, type FetchBytes } from "./evidence.ts";
import { decideFromEvidence } from "./decide.ts";
import { sha256Hex } from "./hash.ts";

const deal = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
const enc = (s: string) => new TextEncoder().encode(s);

function world() {
  const photo = enc("jpeg-bytes");
  const files = new Map<string, Uint8Array>();
  const photoUrl = `http://srv/media/${sha256Hex(photo)}`;
  files.set(photoUrl, photo);
  const metadata = enc(JSON.stringify({
    v: 1, title: "Kurtka", description: "", brand: "X", size: "M", condition: "dobry",
    defects: ["mała dziurka przy kieszeni"],
    photos: [{ url: photoUrl, sha256: sha256Hex(photo) }],
  }));
  const metadataUri = "http://srv/api/listings/l-1/metadata.json";
  files.set(metadataUri, metadata);
  const packingB = enc("packing-video");
  const unboxingB = enc("unboxing-video");
  const complaintB = enc(JSON.stringify({ v: 1, category: "damage", description: "plama", created_at: 1791108000 }));
  for (const b of [packingB, unboxingB, complaintB]) files.set(sha256Hex(b), b);
  const refs: DealRefs = {
    deal,
    metadataUri,
    listingHash: sha256Hex(metadata),
    packingVideoHash: sha256Hex(packingB),
    unboxingVideoHash: sha256Hex(unboxingB),
    complaintHash: sha256Hex(complaintB),
    trackingNumber: "123",
  };
  const key = { packing: refs.packingVideoHash, unboxing: refs.unboxingVideoHash, complaint: refs.complaintHash };
  const fetchBytes: FetchBytes = async (ref) => files.get(ref) ?? null;
  return { files, refs, fetchBytes, key, photoUrl };
}

test("all evidence intact → both sides ok, model needed", async () => {
  const { refs, fetchBytes } = world();
  const e = await collectEvidence(refs, fetchBytes);
  assert.equal(e.check.seller_ok, true);
  assert.equal(e.check.buyer_ok, true);
  assert.equal(e.check.items.length, 5);
  assert.equal(e.photos.length, 1);
  assert.deepEqual(e.metadata?.defects, ["mała dziurka przy kieszeni"]);
  assert.equal(decideFromEvidence(e.check), null);
});

const scenarios: [string, (w: ReturnType<typeof world>) => void, "SELLER" | "BUYER"][] = [
  ["unboxing missing", (w) => { w.files.delete(w.key.unboxing); }, "SELLER"],
  ["unboxing swapped", (w) => { w.files.set(w.key.unboxing, enc("other")); }, "SELLER"],
  ["complaint missing", (w) => { w.files.delete(w.key.complaint); }, "SELLER"],
  ["complaint hash ok but not JSON", (w) => { const b = enc("not json"); w.files.set(w.key.complaint, b); w.refs.complaintHash = sha256Hex(b); }, "SELLER"],
  ["packing missing", (w) => { w.files.delete(w.key.packing); }, "BUYER"],
  ["packing swapped", (w) => { w.files.set(w.key.packing, enc("other")); }, "BUYER"],
  ["metadata missing", (w) => { w.files.delete(w.refs.metadataUri); }, "BUYER"],
  ["metadata edited after listing", (w) => { w.files.set(w.refs.metadataUri, enc("{}")); }, "BUYER"],
  ["photo swapped", (w) => { w.files.set(w.photoUrl, enc("other")); }, "BUYER"],
  ["photo missing", (w) => { w.files.delete(w.photoUrl); }, "BUYER"],
  ["both sides broken → buyer first", (w) => { w.files.delete(w.key.packing); w.files.delete(w.key.unboxing); }, "SELLER"],
];

for (const [name, patch, expected] of scenarios) {
  test(`evidence: ${name} → ${expected}`, async () => {
    const w = world();
    patch(w);
    const e = await collectEvidence(w.refs, w.fetchBytes);
    assert.equal(decideFromEvidence(e.check), expected);
  });
}

test("hash comparison is case-insensitive for on-chain hex", async () => {
  const w = world();
  w.refs.packingVideoHash = w.refs.packingVideoHash.toUpperCase();
  const e = await collectEvidence(w.refs, w.fetchBytes);
  assert.equal(e.check.seller_ok, true);
});
