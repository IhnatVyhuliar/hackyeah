import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as anchor from "@anchor-lang/core";
import {
  Keypair, anchorCode, bytes32, connection, createListed, createPaid, createShipped, dealPda, funded, program, sha256,
  statusOf, waitPastDeadline,
} from "./helpers";

const buy = (l: { deal: anchor.web3.PublicKey }, who: anchor.web3.Keypair, hash: Uint8Array, arbiter: anchor.web3.PublicKey) =>
  program.methods.purchase(bytes32(hash), arbiter).accountsPartial({ buyer: who.publicKey, deal: l.deal }).signers([who]).rpc();

describe("listing and purchase", () => {
  it("create_listing stores the listing", async () => {
    const l = await createListed();
    const deal = await program.account.deal.fetch(l.deal);
    assert.equal(statusOf(deal), "listed");
    assert.ok(deal.seller.equals(l.seller.publicKey));
    assert.ok(deal.arbiter.equals(l.arbiter.publicKey));
    assert.equal(deal.priceLamports.toString(), l.price.toString());
    assert.deepEqual(Buffer.from(deal.listingHash), l.listingHash);
  });

  it("create_listing rejects price 0", async () => {
    const seller = await funded();
    const dealId = new anchor.BN(1);
    await assert.rejects(
      program.methods
        .createListing(dealId, new anchor.BN(0), bytes32(sha256(Buffer.from("x"))), "https://x.example/m.json", Keypair.generate().publicKey)
        .accountsPartial({ seller: seller.publicKey, deal: dealPda(seller.publicKey, dealId) })
        .signers([seller])
        .rpc(),
      anchorCode("InvalidPrice"),
    );
  });

  it("purchase moves the price into escrow", async () => {
    const l = await createListed();
    const before = await connection.getBalance(l.deal);
    const buyer = await funded();
    await buy(l, buyer, l.listingHash, l.arbiter.publicKey);
    const deal = await program.account.deal.fetch(l.deal);
    assert.equal(statusOf(deal), "paid");
    assert.ok(deal.buyer.equals(buyer.publicKey));
    assert.equal(await connection.getBalance(l.deal), before + l.price.toNumber());
  });

  it("purchase rejects the seller, a different description and a different arbiter", async () => {
    const l = await createListed();
    const buyer = await funded();
    await assert.rejects(buy(l, l.seller, l.listingHash, l.arbiter.publicKey), anchorCode("SameParty"));
    await assert.rejects(buy(l, buyer, sha256(Buffer.from("other")), l.arbiter.publicKey), anchorCode("ListingHashMismatch"));
    await assert.rejects(buy(l, buyer, l.listingHash, Keypair.generate().publicKey), anchorCode("ArbiterMismatch"));
  });

  it("cancel_listing is seller-only and blocks purchase", async () => {
    const l = await createListed();
    const stranger = await funded();
    await assert.rejects(
      program.methods.cancelListing().accountsPartial({ seller: stranger.publicKey, deal: l.deal }).signers([stranger]).rpc(),
      anchorCode("Unauthorized"),
    );
    await program.methods.cancelListing().accountsPartial({ seller: l.seller.publicKey, deal: l.deal }).signers([l.seller]).rpc();
    assert.equal(statusOf(await program.account.deal.fetch(l.deal)), "cancelled");
    await assert.rejects(buy(l, await funded(), l.listingHash, l.arbiter.publicKey), anchorCode("InvalidStatus"));
  });
});

type Party = { deal: anchor.web3.PublicKey; seller: anchor.web3.Keypair; buyer: anchor.web3.Keypair };

const accept = (s: Party, who: anchor.web3.Keypair, secret: Uint8Array) =>
  program.methods.acceptDelivery(bytes32(secret))
    .accountsPartial({ buyer: who.publicKey, deal: s.deal, seller: s.seller.publicKey })
    .signers([who]).rpc();

const settle = (s: Party, caller: anchor.web3.Keypair) =>
  program.methods.settleExpired()
    .accountsPartial({ caller: caller.publicKey, deal: s.deal, seller: s.seller.publicKey, buyer: s.buyer.publicKey })
    .signers([caller]).rpc();

describe("shipping, receiving and expiry", () => {
  it("happy path pays the seller exactly the price", async () => {
    const s = await createShipped();
    const shipped = await program.account.deal.fetch(s.deal);
    assert.equal(statusOf(shipped), "shipped");
    assert.equal(shipped.trackingNumber, "INPOST-1");
    const sellerBefore = await connection.getBalance(s.seller.publicKey);
    const dealBefore = await connection.getBalance(s.deal);
    await accept(s, s.buyer, s.secret);
    assert.equal(statusOf(await program.account.deal.fetch(s.deal)), "completed");
    assert.equal(await connection.getBalance(s.seller.publicKey), sellerBefore + s.price.toNumber());
    assert.equal(await connection.getBalance(s.deal), dealBefore - s.price.toNumber()); // rent stays
  });

  it("only the seller ships, only the buyer accepts, only with the right QR", async () => {
    const p = await createPaid();
    const stranger = await funded();
    await assert.rejects(
      program.methods.markShipped(bytes32(sha256(Buffer.from("c"))), bytes32(sha256(Buffer.from("v"))), "X-1")
        .accountsPartial({ seller: stranger.publicKey, deal: p.deal }).signers([stranger]).rpc(),
      anchorCode("Unauthorized"),
    );
    const s = await createShipped();
    await assert.rejects(accept(s, s.buyer, Buffer.alloc(32, 7)), anchorCode("QrMismatch"));
    await assert.rejects(accept(s, stranger, s.secret), anchorCode("Unauthorized"));
  });

  it("Paid past SHIP_TIMEOUT: anyone refunds the buyer, the seller can no longer ship", async () => {
    const p = await createPaid();
    const stranger = await funded();
    await assert.rejects(settle(p, stranger), anchorCode("DeadlineNotReached"));
    await waitPastDeadline();
    await assert.rejects(
      program.methods.markShipped(bytes32(sha256(Buffer.from("c"))), bytes32(sha256(Buffer.from("v"))), "X-1")
        .accountsPartial({ seller: p.seller.publicKey, deal: p.deal }).signers([p.seller]).rpc(),
      anchorCode("DeadlinePassed"),
    );
    const buyerBefore = await connection.getBalance(p.buyer.publicKey);
    await settle(p, stranger);
    assert.equal(statusOf(await program.account.deal.fetch(p.deal)), "refunded");
    assert.equal(await connection.getBalance(p.buyer.publicKey), buyerBefore + p.price.toNumber());
  });

  it("Shipped past UNBOX_TIMEOUT: anyone pays the seller, the buyer can no longer accept", async () => {
    const s = await createShipped();
    const stranger = await funded();
    await waitPastDeadline();
    await assert.rejects(accept(s, s.buyer, s.secret), anchorCode("DeadlinePassed"));
    const sellerBefore = await connection.getBalance(s.seller.publicKey);
    await settle(s, stranger);
    assert.equal(statusOf(await program.account.deal.fetch(s.deal)), "completed");
    assert.equal(await connection.getBalance(s.seller.publicKey), sellerBefore + s.price.toNumber());
    await assert.rejects(settle(s, stranger), anchorCode("InvalidStatus"));
  });
});
