import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import * as anchor from "@anchor-lang/core";
import type { UnboxEscrow } from "../target/types/unbox_escrow";

export const { Keypair, PublicKey, LAMPORTS_PER_SOL } = anchor.web3;
export type Kp = anchor.web3.Keypair;
type Pk = anchor.web3.PublicKey;

const env = anchor.AnchorProvider.env();
export const provider = new anchor.AnchorProvider(env.connection, env.wallet, {
  commitment: "confirmed",
  preflightCommitment: "confirmed",
});
anchor.setProvider(provider);
export const program = anchor.workspace.UnboxEscrow as anchor.Program<UnboxEscrow>;
export const connection = provider.connection;

export const sha256 = (...parts: Uint8Array[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
export const bytes32 = (b: Uint8Array) => Array.from(b);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const statusOf = (deal: { status: object }) => Object.keys(deal.status)[0];

/** Matcher for assert.rejects: the Anchor error code (e.g. "QrMismatch"). */
export const anchorCode = (code: string) => (e: any) => {
  assert.equal(e?.error?.errorCode?.code, code, String(e));
  return true;
};

export async function funded(sol = 5): Promise<Kp> {
  const kp = Keypair.generate();
  const signature = await connection.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature, ...(await connection.getLatestBlockhash()) }, "confirmed");
  return kp;
}

export const dealPda = (seller: Pk, dealId: anchor.BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), seller.toBuffer(), dealId.toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0];

let nextId = Date.now();
export interface Listed { seller: Kp; arbiter: Kp; deal: Pk; dealId: anchor.BN; listingHash: Buffer; price: anchor.BN }

export async function createListed(price = new anchor.BN(LAMPORTS_PER_SOL / 10)): Promise<Listed> {
  const seller = await funded();
  const arbiter = Keypair.generate();
  const dealId = new anchor.BN(nextId++);
  const deal = dealPda(seller.publicKey, dealId);
  const listingHash = sha256(Buffer.from(`listing-${dealId}`));
  await program.methods
    .createListing(dealId, price, bytes32(listingHash), `https://example.com/listings/${deal}/metadata.json`, arbiter.publicKey)
    .accountsPartial({ seller: seller.publicKey, deal })
    .signers([seller])
    .rpc();
  return { seller, arbiter, deal, dealId, listingHash, price };
}

export async function createPaid(): Promise<Listed & { buyer: Kp }> {
  const l = await createListed();
  const buyer = await funded();
  await program.methods
    .purchase(bytes32(l.listingHash), l.arbiter.publicKey)
    .accountsPartial({ buyer: buyer.publicKey, deal: l.deal })
    .signers([buyer])
    .rpc();
  return { ...l, buyer };
}

export async function createShipped(): Promise<Listed & { buyer: Kp; secret: Buffer }> {
  const p = await createPaid();
  const secret = randomBytes(32);
  await program.methods
    .markShipped(bytes32(sha256(p.deal.toBuffer(), secret)), bytes32(sha256(Buffer.from("packing.mp4"))), "INPOST-1")
    .accountsPartial({ seller: p.seller.publicKey, deal: p.deal })
    .signers([p.seller])
    .rpc();
  return { ...p, secret };
}

/** Unix time the program sees (Clock sysvar). */
export async function chainNow(): Promise<number> {
  const clock = await connection.getAccountInfo(anchor.web3.SYSVAR_CLOCK_PUBKEY, "confirmed");
  return Number(clock!.data.readBigInt64LE(32));
}

/** Program built with `test-timeouts` (5 s). Surfpool's clock only moves with slots, so jump it forward. */
export async function waitPastDeadline() {
  const target = (await chainNow()) + 10;
  const res = await (connection as any)._rpcRequest("surfnet_timeTravel", [{ absoluteTimestamp: target * 1000 }]);
  if (res.error) throw new Error(`surfnet_timeTravel: ${JSON.stringify(res.error)}`);
  assert.ok((await chainNow()) >= target, "clock did not move");
}

type Shipped = Awaited<ReturnType<typeof createShipped>>;

export const openDispute = (s: Shipped, who: Kp, secret: Uint8Array, videoHash = sha256(Buffer.from("unboxing.mp4")),
  complaintHash = sha256(Buffer.from("complaint.json"))) =>
  program.methods.openDispute(bytes32(secret), bytes32(videoHash), bytes32(complaintHash))
    .accountsPartial({ buyer: who.publicKey, deal: s.deal }).signers([who]).rpc();

export async function createDisputed() {
  const s = await createShipped();
  const videoHash = sha256(Buffer.from("unboxing.mp4"));
  const complaintHash = sha256(Buffer.from("complaint.json"));
  await openDispute(s, s.buyer, s.secret, videoHash, complaintHash);
  return { ...s, videoHash, complaintHash };
}

export const resolve = (d: { deal: Pk; seller: Kp }, signer: Kp, verdict: "seller" | "buyer" | "none",
  reportHash = sha256(Buffer.from("report.json"))) =>
  program.methods.resolveDispute({ [verdict]: {} } as any, bytes32(reportHash))
    .accountsPartial({ arbiter: signer.publicKey, deal: d.deal, seller: d.seller.publicKey }).signers([signer]).rpc();

export type Party = { deal: Pk; seller: Kp; buyer: Kp };
export const settleExpired = (s: Party, caller: Kp) =>
  program.methods.settleExpired()
    .accountsPartial({ caller: caller.publicKey, deal: s.deal, seller: s.seller.publicKey, buyer: s.buyer.publicKey })
    .signers([caller]).rpc();
