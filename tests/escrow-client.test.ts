import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import * as anchor from "@anchor-lang/core";
import { isEscrowError } from "@unbox/shared";
import { createEscrowCore } from "../app/src/solana/escrow";
import { chainNow, connection, dealPda, funded, program, statusOf, waitPastDeadline } from "./helpers";

const idl = JSON.parse(readFileSync("target/idl/unbox_escrow.json", "utf8"));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const files = new Map<string, Uint8Array>();
const fetchBytes = async (url: string) => files.get(url) ?? null;

async function market() {
  const [seller, buyer] = [await funded(), await funded()];
  const arbiter = anchor.web3.Keypair.generate();
  const mk = (kp: anchor.web3.Keypair, trusted = arbiter.publicKey) =>
    createEscrowCore({ connection, keypair: kp, idl, trustedArbiter: trusted, fetchBytes, cluster: "custom" });
  const dealId = Date.now() + Math.floor(Math.random() * 1000);
  const deal = dealPda(seller.publicKey, new anchor.BN(dealId));
  const metadata = Buffer.from(JSON.stringify({ v: 1, title: `Kurtka ${dealId}` }));
  const metadataUri = `mem://${deal}/metadata.json`;
  files.set(metadataUri, metadata);
  const args = { listingId: `l-${dealId}`, deal: deal.toBase58(), dealId, priceLamports: 60_000_000,
    listingHash: createHash("sha256").update(metadata).digest("hex"), metadataUri, arbiter: arbiter.publicKey.toBase58(),
    programId: program.programId.toBase58() };
  return { seller, buyer, arbiter, deal, args, metadataUri, s: mk(seller), b: mk(buyer), mk, key: { id: args.listingId, deal: deal.toBase58() } };
}
const code = (c: string) => (e: unknown) => isEscrowError(e) && e.code === c;

describe("SolanaEscrow against the program", () => {
  it("happy path through the Escrow interface; networkNow is the chain clock", async () => {
    const m = await market();
    assert.equal(await m.b.walletAddress(), m.buyer.publicKey.toBase58());
    assert.ok(Math.abs((await m.b.networkNow()) - (await chainNow())) <= 2);
    await m.s.createListing(m.args);
    const r = await m.b.purchase(m.key);
    assert.match(r.explorerUrl ?? "", /explorer\.solana\.com\/tx\//);
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    const before = await connection.getBalance(m.seller.publicKey);
    await m.b.acceptDelivery(m.key, card.payload);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "completed");
    assert.equal(await connection.getBalance(m.seller.publicKey), before + 60_000_000);
  });

  it("Review Focus 2: tampered metadata or a foreign arbiter stop the purchase before signing", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    files.set(m.metadataUri, Buffer.from("{}"));
    const before = await connection.getBalance(m.buyer.publicKey);
    await assert.rejects(m.b.purchase(m.key), code("ListingMismatch"));
    const m2 = await market();
    await m2.s.createListing(m2.args);
    await assert.rejects(m2.mk(m2.buyer, anchor.web3.Keypair.generate().publicKey).purchase(m2.key), code("ArbiterMismatch"));
    assert.equal(await connection.getBalance(m.buyer.publicKey), before);
  });

  it("a seller who is the arbiter of their own sale is refused before signing, even if the app trusts that key", async () => {
    const m = await market();
    await m.mk(m.seller, m.seller.publicKey).createListing({ ...m.args, arbiter: m.seller.publicKey.toBase58() });
    const before = await connection.getBalance(m.buyer.publicKey);
    await assert.rejects(m.mk(m.buyer, m.seller.publicKey).purchase(m.key), code("ArbiterMismatch"));
    assert.equal(await connection.getBalance(m.buyer.publicKey), before);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "listed");
  });

  it("Review Focus 1: a card from another parcel or a return card is refused before anything is sent", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    const other = await m.s.newQrCard("ship", m.key);           // same deal, different secret: not the packed card
    const ret = await m.s.newQrCard("return", m.key);
    const before = await connection.getBalance(m.buyer.publicKey);
    await assert.rejects(m.b.acceptDelivery(m.key, other.payload), code("QrMismatch"));
    await assert.rejects(m.b.acceptDelivery(m.key, ret.payload), code("QrMismatch"));
    await assert.rejects(m.b.acceptDelivery(m.key, "UNBOX1:l-kurtka:" + "ab".repeat(32)), code("QrMismatch"));
    assert.equal(await connection.getBalance(m.buyer.publicKey), before);   // no fee was paid
  });

  it("dispute → Buyer verdict → return → refund, and settle mapping", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    await assert.rejects(m.b.settleExpired(m.key), code("DeadlineNotReached"));
    const card = await m.s.newQrCard("ship", m.key);
    await m.s.markShipped(m.key, { qrCommitment: card.commitment, packingVideoSha256: hex(randomBytes(32)), trackingNumber: "INP1" });
    await m.b.openDispute(m.key, { qrPayload: card.payload, unboxingVideoSha256: hex(randomBytes(32)),
      complaint: { category: "damaged", description: "plama" }, complaintSha256: hex(randomBytes(32)) });
    await program.methods.resolveDispute({ buyer: {} } as any, Array.from(randomBytes(32)))
      .accountsPartial({ arbiter: m.arbiter.publicKey, deal: m.deal, seller: m.seller.publicKey }).signers([m.arbiter]).rpc();
    const ret = await m.b.newQrCard("return", m.key);
    await m.b.markReturned(m.key, { returnQrCommitment: ret.commitment, returnVideoSha256: hex(randomBytes(32)), trackingNumber: "ZWROT-1" });
    const before = await connection.getBalance(m.buyer.publicKey);
    await m.s.confirmReturn(m.key, ret.payload);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "refunded");
    assert.equal(await connection.getBalance(m.buyer.publicKey), before + 60_000_000);
  });

  it("anyone settles after the deadline through Escrow", async () => {
    const m = await market();
    await m.s.createListing(m.args);
    await m.b.purchase(m.key);
    await waitPastDeadline();
    await m.mk(await funded()).settleExpired(m.key);
    assert.equal(statusOf(await program.account.deal.fetch(m.deal)), "refunded");
  });

  it("rejects only with EscrowError: bad deal key, dead RPC", async () => {
    const m = await market();
    await assert.rejects(m.b.acceptDelivery({ id: "x", deal: "not-a-key" }, "UNBOX1:a:b"), (e) => isEscrowError(e) && e.code === "Rejected");
    await assert.rejects(m.b.settleExpired({ id: "x", deal: null }), (e) => isEscrowError(e) && e.code === "Rejected");
    const dead = createEscrowCore({ connection: new anchor.web3.Connection("http://127.0.0.1:9", "confirmed"), keypair: m.buyer,
      idl, trustedArbiter: m.arbiter.publicKey, fetchBytes });
    await assert.rejects(dead.networkNow(), code("Network"));
  });
});
