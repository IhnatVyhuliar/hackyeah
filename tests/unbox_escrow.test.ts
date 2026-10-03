import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as anchor from "@anchor-lang/core";
import {
  Keypair, anchorCode, bytes32, connection, createListed, dealPda, funded, program, sha256, statusOf,
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
