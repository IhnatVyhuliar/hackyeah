// Full dispute pipeline for one deal: evidence → (model) → decide() → report.json → resolve_dispute.
import { type Chain, type DealEntry, dealRefs, explorerTx, timeouts } from "./chain.ts";
import { decide, decideFromEvidence } from "./decide.ts";
import { collectEvidence } from "./evidence.ts";
import { analyzeWithRetry } from "./gemini.ts";
import { sha256, sha256Hex } from "./hash.ts";
import type { OracleReport, Verdict } from "./report.ts";
import { fetchBytes, uploadReport } from "./storage.ts";

// Don't send resolve_dispute this close to ORACLE_TIMEOUT: the program would reject it,
// and silence already has a defined outcome (ReturnRequested via settle_expired).
const DEADLINE_MARGIN_S = 30;

const log = (deal: string, msg: string) => console.log(`${new Date().toISOString()} [resolve ${deal.slice(0, 8)}] ${msg}`);

export const shouldResolve = (changedAt: number, now: number, timeout: number) => changedAt + timeout - now > DEADLINE_MARGIN_S;

const canResolve = (d: DealEntry) =>
  shouldResolve(d.account.statusChangedAt.toNumber(), Math.floor(Date.now() / 1000), timeouts().oracle);

export async function resolveDeal(chain: Chain, d: DealEntry): Promise<void> {
  const refs = dealRefs(d.publicKey, d.account);
  const id = refs.deal;
  const t0 = Date.now();
  if (!canResolve(d)) {
    log(id, "skip: too close to ORACLE_TIMEOUT");
    return;
  }

  const ev = await collectEvidence(refs, fetchBytes);
  log(id, `evidence in ${Date.now() - t0} ms: seller_ok=${ev.check.seller_ok} buyer_ok=${ev.check.buyer_ok}`);
  for (const i of ev.check.items.filter((i) => !i.ok)) {
    log(id, `  ✗ ${i.author} ${i.path}: expected ${i.expected_sha256}, got ${i.actual_sha256 ?? "missing"}`);
  }

  const base = { v: 1 as const, deal: id, evidence: ev.check, created_at: "" };
  let report: OracleReport;
  const byEvidence = decideFromEvidence(ev.check);
  if (byEvidence) {
    report = { ...base, verdict: byEvidence, decided_by: "evidence", prompt_version: null, model: null, usage: null };
  } else {
    const res = await analyzeWithRetry({
      metadata: ev.metadata!,
      photos: ev.photos,
      trackingNumber: refs.trackingNumber,
      packing: ev.packing!,
      unboxing: ev.unboxing!,
      complaint: ev.complaint!,
    });
    log(id, `model ${res.model} ${JSON.stringify(res.timings)} tokens ${JSON.stringify(res.usage)}`);
    report = {
      ...base,
      ...res.report,
      verdict: decide(res.report),
      decided_by: "decide",
      prompt_version: res.promptVersion,
      model: res.model,
      usage: res.usage,
    };
  }
  report.created_at = new Date().toISOString();
  const verdict: Verdict = report.verdict;
  const bytes = new TextEncoder().encode(JSON.stringify(report, null, 2));

  const stored = await uploadReport(bytes);
  if (stored !== sha256Hex(bytes)) throw new Error(`report upload hash mismatch: ${stored} vs ${sha256Hex(bytes)}`);

  if (!canResolve(d)) {
    log(id, "give up: too close to ORACLE_TIMEOUT, settle_expired will handle it");
    return;
  }
  const sig = await chain.resolveDispute(d, verdict, sha256(bytes));
  log(id, `resolve_dispute ${verdict} report ${sha256Hex(bytes)} in ${Date.now() - t0} ms → ${explorerTx(sig)}`);
}
