import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, decideFromEvidence } from "./decide.ts";
import { parseModelReport, type ModelReport } from "./report.ts";

// Honest, good recordings, item as listed, no damage.
function base(): ModelReport {
  return {
    buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: "good", notes: "" },
    seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: "good", notes: "" },
    package_matches_shipping_recording: true,
    item_matches_listing: true,
    undisclosed_damage: { present: false, description: "", timestamps: [] },
    reasoning: "",
  };
}

type Patch = (r: ModelReport) => void;
const cases: [string, Patch, "SELLER" | "BUYER"][] = [
  ["all fine, unfounded complaint", () => {}, "SELLER"],
  ["undisclosed damage", (r) => { r.undisclosed_damage.present = true; }, "BUYER"],
  ["item does not match listing", (r) => { r.item_matches_listing = false; }, "BUYER"],
  // buyer recording weak → seller, even with damage
  ["buyer cut + damage", (r) => { r.buyer_recording.continuous = false; r.undisclosed_damage.present = true; }, "SELLER"],
  ["buyer starts opened + damage", (r) => { r.buyer_recording.starts_with_sealed_package = false; r.undisclosed_damage.present = true; }, "SELLER"],
  ["buyer QR not revealed + damage", (r) => { r.buyer_recording.qr_revealed_on_opening = false; r.undisclosed_damage.present = true; }, "SELLER"],
  ["buyer poor quality + damage", (r) => { r.buyer_recording.quality = "poor"; r.undisclosed_damage.present = true; }, "SELLER"],
  // package differs from the shipped one, seller recording good → tampering
  ["package mismatch + damage", (r) => { r.package_matches_shipping_recording = false; r.undisclosed_damage.present = true; }, "SELLER"],
  ["package mismatch, no damage", (r) => { r.package_matches_shipping_recording = false; }, "SELLER"],
  // weak seller recording disables the package check → works against seller
  ["seller poor + package mismatch + damage", (r) => { r.seller_recording.quality = "poor"; r.package_matches_shipping_recording = false; r.undisclosed_damage.present = true; }, "BUYER"],
  ["seller item not visible + package mismatch + wrong item", (r) => { r.seller_recording.item_clearly_visible = false; r.package_matches_shipping_recording = false; r.item_matches_listing = false; }, "BUYER"],
  ["seller QR not packed + package mismatch + damage", (r) => { r.seller_recording.qr_card_packed = false; r.package_matches_shipping_recording = false; r.undisclosed_damage.present = true; }, "BUYER"],
  ["seller poor + package mismatch, no damage", (r) => { r.seller_recording.quality = "poor"; r.package_matches_shipping_recording = false; }, "SELLER"],
  // package_sealed_and_labeled is informational only (not part of sellerOk in §5)
  ["seller not sealed + damage", (r) => { r.seller_recording.package_sealed_and_labeled = false; r.undisclosed_damage.present = true; }, "BUYER"],
];

for (const [name, patch, expected] of cases) {
  test(`decide: ${name} → ${expected}`, () => {
    const r = base();
    patch(r);
    assert.equal(decide(r), expected);
  });
}

test("decideFromEvidence: buyer evidence broken → SELLER", () => {
  assert.equal(decideFromEvidence({ items: [], seller_ok: true, buyer_ok: false }), "SELLER");
});
test("decideFromEvidence: seller evidence broken → BUYER", () => {
  assert.equal(decideFromEvidence({ items: [], seller_ok: false, buyer_ok: true }), "BUYER");
});
test("decideFromEvidence: both broken → buyer checked first → SELLER", () => {
  assert.equal(decideFromEvidence({ items: [], seller_ok: false, buyer_ok: false }), "SELLER");
});
test("decideFromEvidence: all intact → null (ask the model)", () => {
  assert.equal(decideFromEvidence({ items: [], seller_ok: true, buyer_ok: true }), null);
});

test("parseModelReport accepts a valid report", () => {
  assert.deepEqual(parseModelReport(JSON.parse(JSON.stringify(base()))), base());
});
test("parseModelReport rejects wrong types and missing fields", () => {
  const bad1 = { ...base(), item_matches_listing: "yes" };
  const bad2 = { ...base(), buyer_recording: { ...base().buyer_recording, quality: "ok" } };
  const { reasoning: _, ...bad3 } = base();
  const bad4 = { ...base(), undisclosed_damage: { present: true, description: "", timestamps: [1] } };
  for (const bad of [bad1, bad2, bad3, bad4, null, "x"]) assert.throws(() => parseModelReport(bad));
});
