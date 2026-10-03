import type { EvidenceCheck, ModelReport, Verdict } from "./report.ts";

// The verdict is computed here, never by the model (CLAUDE.md §5).
// Weak or cut recordings count against their author.
export function decide(r: ModelReport): Verdict {
  const b = r.buyer_recording, s = r.seller_recording;
  const buyerOk = b.continuous && b.starts_with_sealed_package && b.qr_revealed_on_opening && b.quality === "good";
  if (!buyerOk) return "SELLER";
  const sellerOk = s.quality === "good" && s.item_clearly_visible && s.qr_card_packed;
  if (sellerOk && !r.package_matches_shipping_recording) return "SELLER"; // package differs from shipped one → tampering
  if (!r.item_matches_listing || r.undisclosed_damage.present) return "BUYER";
  return "SELLER";
}

// Missing file or hash mismatch → the author of that file loses, without calling the model.
// Buyer evidence is checked first: without a valid unboxing there is no complaint
// (pending team confirmation, docs/zadania/5-wyrocznia.md).
// Returns null when all evidence is intact and the model has to look at it.
export function decideFromEvidence(e: EvidenceCheck): Verdict | null {
  if (!e.buyer_ok) return "SELLER";
  if (!e.seller_ok) return "BUYER";
  return null;
}
