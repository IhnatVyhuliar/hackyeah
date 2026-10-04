import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  anchorCode, bytes32, connection, createDisputed, createShipped, funded, openDispute, program, resolve, settleExpired, sha256,
  statusOf, waitPastDeadline,
} from "./helpers";

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

describe("resolve_dispute", () => {
  it("Seller pays the seller exactly the price and completes; the report hash is stored", async () => {
    const d = await createDisputed();
    const before = await connection.getBalance(d.seller.publicKey);
    await resolve(d, d.arbiter, "seller");
    const acc = await program.account.deal.fetch(d.deal);
    assert.deepEqual([statusOf(acc), Object.keys(acc.verdict)[0]], ["completed", "seller"]);
    assert.deepEqual(acc.reportHash, bytes32(sha256(Buffer.from("report.json"))));
    assert.equal(await connection.getBalance(d.seller.publicKey), before + d.price.toNumber());
  });

  it("Buyer asks for the return; funds stay in escrow", async () => {
    const d = await createDisputed();
    const before = await connection.getBalance(d.deal);
    await resolve(d, d.arbiter, "buyer");
    assert.equal(statusOf(await program.account.deal.fetch(d.deal)), "returnRequested");
    assert.equal(await connection.getBalance(d.deal), before);
  });

  it("only the deal's arbiter, only a real verdict, only once, only before ORACLE_TIMEOUT", async () => {
    const d = await createDisputed();
    await assert.rejects(resolve(d, await funded(), "buyer"), anchorCode("Unauthorized"));
    await assert.rejects(resolve(d, d.arbiter, "none"), anchorCode("InvalidVerdict"));
    await assert.rejects(resolve(d, d.arbiter, "seller", Buffer.alloc(32)), anchorCode("EmptyHash"));
    const late = await createDisputed();
    await waitPastDeadline();
    await assert.rejects(resolve(late, late.arbiter, "seller"), anchorCode("DeadlinePassed"));
    await settleExpired(late, await funded()); // silent oracle -> neutral return
    assert.equal(statusOf(await program.account.deal.fetch(late.deal)), "returnRequested");
    assert.equal(Object.keys((await program.account.deal.fetch(late.deal)).verdict)[0], "none");
  });

  it("a resolved dispute cannot be resolved again", async () => {
    const d = await createDisputed();
    await resolve(d, d.arbiter, "buyer");
    await assert.rejects(resolve(d, d.arbiter, "seller"), anchorCode("InvalidStatus"));
  });
});
