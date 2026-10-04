// Thin wrapper over the unbox_escrow program. The oracle can only call resolve_dispute
// (as deal.arbiter) and settle_expired (anyone); there is no other path that moves funds.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { AnchorProvider, Program, Wallet, type Idl } from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { toHex } from "./hash.ts";
import type { DealRefs } from "./evidence.ts";
import type { Verdict } from "./report.ts";

// Deal account as decoded by Anchor (camelCase). Checked against IDL v0 once O1 publishes it.
export interface DealAccount {
  seller: PublicKey;
  buyer: PublicKey;
  arbiter: PublicKey;
  dealId: { toString(): string };
  priceLamports: { toString(): string };
  listingHash: number[];
  metadataUri: string;
  status: Record<string, object>;
  statusChangedAt: { toNumber(): number };
  qrCommitment: number[];
  packingVideoHash: number[];
  trackingNumber: string;
  unboxingVideoHash: number[];
  complaintHash: number[];
  verdict: Record<string, object>;
  reportHash: number[];
}

export interface DealEntry {
  publicKey: PublicKey;
  account: DealAccount;
}

export type DealStatus =
  | "listed" | "paid" | "shipped" | "disputed" | "returnRequested"
  | "returning" | "completed" | "refunded" | "cancelled";

export const statusOf = (d: DealAccount) => Object.keys(d.status)[0] as DealStatus;

// Must match programs/unbox_escrow/src/constants.rs (feature `demo` vs production), in seconds.
const DAY = 86_400;
const TIMEOUTS = {
  demo: { ship: 600, unbox: 3600, oracle: 600, returnShip: 600, returnConfirm: 600 },
  prod: { ship: 3 * DAY, unbox: 7 * DAY, oracle: DAY, returnShip: 3 * DAY, returnConfirm: 7 * DAY },
};
export const timeouts = () => TIMEOUTS[process.env.TIMEOUTS === "prod" ? "prod" : "demo"];

// Statuses settle_expired can close, with the timeout that applies (CLAUDE.md §4).
export function settleTimeout(status: DealStatus): number | null {
  const t = timeouts();
  switch (status) {
    case "paid": return t.ship;
    case "shipped": return t.unbox;
    case "disputed": return t.oracle;
    case "returnRequested": return t.returnShip;
    case "returning": return t.returnConfirm;
    default: return null;
  }
}

export function dealRefs(pk: PublicKey, d: DealAccount): DealRefs {
  return {
    deal: pk.toBase58(),
    metadataUri: d.metadataUri,
    listingHash: toHex(d.listingHash),
    packingVideoHash: toHex(d.packingVideoHash),
    unboxingVideoHash: toHex(d.unboxingVideoHash),
    complaintHash: toHex(d.complaintHash),
    trackingNumber: d.trackingNumber,
  };
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

async function loadKeypair(path: string): Promise<Keypair> {
  const resolved = path.startsWith("~") ? homedir() + path.slice(1) : path;
  const secret = JSON.parse(await readFile(resolved, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface Chain {
  oracle: PublicKey;
  connection: Connection;
  fetchDeals(): Promise<DealEntry[]>;
  resolveDispute(deal: DealEntry, verdict: Verdict, reportHash: Uint8Array): Promise<string>;
  settleExpired(deal: DealEntry): Promise<string>;
}

export async function connect(): Promise<Chain> {
  const rpc = process.env.RPC_URL || "https://api.devnet.solana.com";
  if (/mainnet/i.test(rpc)) throw new Error("devnet only");
  const keypair = await loadKeypair(process.env.ORACLE_KEYPAIR || "~/.config/unbox/oracle.json");
  const idlPath = process.env.IDL_PATH || "../packages/shared/idl/unbox_escrow.json";
  const idl = JSON.parse(await readFile(idlPath, "utf8")) as Idl;
  const connection = new Connection(rpc, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
  // Untyped on purpose: the IDL is loaded at runtime from packages/shared.
  const program = new Program(idl, provider) as Program<any>;

  return {
    oracle: keypair.publicKey,
    connection,
    async fetchDeals() {
      const accounts = program.account as unknown as Record<string, { all(): Promise<unknown[]> }>;
      return (await accounts.deal!.all()) as DealEntry[];
    },
    async resolveDispute(deal, verdict, reportHash) {
      const arg = verdict === "BUYER" ? { buyer: {} } : { seller: {} };
      return program.methods
        .resolveDispute(arg, Array.from(reportHash))
        .accountsPartial({
          deal: deal.publicKey,
          arbiter: keypair.publicKey,
          seller: deal.account.seller,
        })
        .rpc();
    },
    async settleExpired(deal) {
      return program.methods
        .settleExpired()
        .accountsPartial({
          deal: deal.publicKey,
          seller: deal.account.seller,
          buyer: deal.account.buyer,
        })
        .rpc();
    },
  };
}
