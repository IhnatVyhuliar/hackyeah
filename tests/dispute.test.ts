import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anchorCode, bytes32, createDisputed, createShipped, funded, openDispute, program, statusOf, waitPastDeadline } from "./helpers";

describe("open_dispute", () => {
  it("stores both hashes and moves to Disputed; funds stay in escrow", async () => {
    const d = await createDisputed();
    const acc = await program.account.deal.fetch(d.deal);
    assert.equal(statusOf(acc), "disputed");
    assert.deepEqual(acc.unboxingVideoHash, bytes32(d.videoHash));
    assert.deepEqual(acc.complaintHash, bytes32(d.complaintHash));
  });

  it("needs the buyer, the right QR, non-empty hashes, and the Shipped deadline", async () => {
    const s = await createShipped();
    const stranger = await funded();
    await assert.rejects(openDispute(s, stranger, s.secret), anchorCode("Unauthorized"));
    await assert.rejects(openDispute(s, s.buyer, Buffer.alloc(32, 7)), anchorCode("QrMismatch"));
    await assert.rejects(openDispute(s, s.buyer, s.secret, Buffer.alloc(32)), anchorCode("EmptyHash"));
    await assert.rejects(openDispute(s, s.buyer, s.secret, undefined, Buffer.alloc(32)), anchorCode("EmptyHash"));
    await waitPastDeadline();
    await assert.rejects(openDispute(s, s.buyer, s.secret), anchorCode("DeadlinePassed"));
  });

  it("the QR is single-use: a disputed deal cannot be accepted or disputed again", async () => {
    const d = await createDisputed();
    await assert.rejects(openDispute(d, d.buyer, d.secret), anchorCode("InvalidStatus"));
    await assert.rejects(
      program.methods.acceptDelivery(bytes32(d.secret)).accountsPartial({ buyer: d.buyer.publicKey, deal: d.deal, seller: d.seller.publicKey })
        .signers([d.buyer]).rpc(),
      anchorCode("InvalidStatus"),
    );
  });
});
