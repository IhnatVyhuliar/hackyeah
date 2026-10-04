// Oracle loop: resolves disputes assigned to our arbiter key and cranks settle_expired.
// Cranking is a convenience only; anyone can call settle_expired.
import { connect, explorerTx, settleTimeout, statusOf, type DealEntry } from "./chain.ts";
import { crankEnabled } from "./crank.ts";
import { resolveDeal } from "./resolve.ts";

const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 5000);
// Local clock vs cluster clock skew; the program checks `now >= deadline` with its own Clock.
const SETTLE_MARGIN_S = 5;

const CRANK = crankEnabled(process.env);

const chain = await connect();
console.log(`[watch] oracle ${chain.oracle.toBase58()}, polling every ${POLL_MS} ms`);
console.log(`[watch] crank ${CRANK ? "ON: also calls settle_expired on expired deals" : "OFF: settle_expired is left to the parties"}`);

const inFlight = new Set<string>();
// After a failure wait before retrying, so a broken deal does not burn model tokens every tick.
const RETRY_COOLDOWN_MS = 30_000;
const coolingUntil = new Map<string, number>();

function run(key: string, task: () => Promise<void>) {
  if (inFlight.has(key) || (coolingUntil.get(key) ?? 0) > Date.now()) return;
  inFlight.add(key);
  task()
    .catch((e) => {
      console.error(`[watch] ${key} failed: ${(e as Error).message}`);
      coolingUntil.set(key, Date.now() + RETRY_COOLDOWN_MS);
    })
    .finally(() => inFlight.delete(key));
}

async function tick() {
  let deals: DealEntry[];
  try {
    deals = await chain.fetchDeals();
  } catch (e) {
    console.error(`[watch] fetchDeals: ${(e as Error).message}`);
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  for (const d of deals) {
    const id = d.publicKey.toBase58();
    const status = statusOf(d.account);
    const timeout = settleTimeout(status);
    const expired = timeout !== null && now >= d.account.statusChangedAt.toNumber() + timeout + SETTLE_MARGIN_S;

    if (expired) {
      if (!CRANK) continue;
      run(`settle:${id}`, async () => {
        const sig = await chain.settleExpired(d);
        console.log(`[watch] settle_expired ${id.slice(0, 8)} (${status}) → ${explorerTx(sig)}`);
      });
    } else if (status === "disputed" && d.account.arbiter.equals(chain.oracle)) {
      run(`resolve:${id}`, () => resolveDeal(chain, d));
    }
  }
}

for (;;) {
  await tick();
  await new Promise((r) => setTimeout(r, POLL_MS));
}
