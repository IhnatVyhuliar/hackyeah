import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
