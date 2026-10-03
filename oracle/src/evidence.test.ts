import { test } from "node:test";
import assert from "node:assert/strict";
import { collectEvidence, dealPaths, type DealRefs, type FetchBytes } from "./evidence.ts";
import { decideFromEvidence } from "./decide.ts";
import { sha256Hex } from "./hash.ts";

const deal = "4wBqpZM9xaSheZzJSMawUKKwhdpChKbZ5eu5ky4Vigw";
const enc = (s: string) => new TextEncoder().encode(s);

function world() {
  const photo = enc("jpeg-bytes");
  const files = new Map<string, Uint8Array>();
  files.set(`listings/${deal}/photo-0.jpg`, photo);
  const metadata = enc(JSON.stringify({
    v: 1, title: "Kurtka", description: "", brand: "X", size: "M", condition: "dobry",
    defects: ["mała dziurka przy kieszeni"],
    photos: [{ path: `listings/${deal}/photo-0.jpg`, sha256: sha256Hex(photo) }],
  }));
  const metadataUri = `https://x.supabase.co/storage/v1/object/public/unbox/listings/${deal}/metadata.json`;
  files.set(metadataUri, metadata);
  const p = dealPaths(deal);
  files.set(p.packing, enc("packing-video"));
  files.set(p.unboxing, enc("unboxing-video"));
  files.set(p.complaint, enc(JSON.stringify({ v: 1, category: "damage", description: "plama", created_at: "2026-10-04T10:00:00Z" })));
  const refs: DealRefs = {
    deal,
    metadataUri,
    listingHash: sha256Hex(metadata),
    packingVideoHash: sha256Hex(files.get(p.packing)!),
    unboxingVideoHash: sha256Hex(files.get(p.unboxing)!),
    complaintHash: sha256Hex(files.get(p.complaint)!),
    trackingNumber: "123",
  };
  const fetchBytes: FetchBytes = async (ref) => files.get(ref) ?? null;
  return { files, refs, fetchBytes, p };
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
  ["unboxing missing", (w) => { w.files.delete(w.p.unboxing); }, "SELLER"],
  ["unboxing swapped", (w) => { w.files.set(w.p.unboxing, enc("other")); }, "SELLER"],
  ["complaint missing", (w) => { w.files.delete(w.p.complaint); }, "SELLER"],
  ["complaint hash ok but not JSON", (w) => { const b = enc("not json"); w.files.set(w.p.complaint, b); w.refs.complaintHash = sha256Hex(b); }, "SELLER"],
  ["packing missing", (w) => { w.files.delete(w.p.packing); }, "BUYER"],
  ["packing swapped", (w) => { w.files.set(w.p.packing, enc("other")); }, "BUYER"],
  ["metadata missing", (w) => { w.files.delete(w.refs.metadataUri); }, "BUYER"],
  ["metadata edited after listing", (w) => { w.files.set(w.refs.metadataUri, enc("{}")); }, "BUYER"],
  ["photo swapped", (w) => { w.files.set(`listings/${deal}/photo-0.jpg`, enc("other")); }, "BUYER"],
  ["both sides broken → buyer first", (w) => { w.files.delete(w.p.packing); w.files.delete(w.p.unboxing); }, "SELLER"],
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
