// Wyrocznia (KONTRAKT §9.5). Przekazuje pomiary do programu; NIE liczy wyniku.
// O wypłacie albo zwrocie decyduje submit_verdict w programie według tabeli §3.
import type { Measurements, Order } from '@sellsol/shared';
import { addTimeline, addTx, applyEscrow, chain, getOrder, readEscrow, rememberEscrow, saveOrder, verificationsOf } from './orders';

/** Pomiary, gdy nie ma ważnego raportu dla haszu zapisanego on-chain. */
const INVALID: Measurements = {
  recordingValid: false, qrMatch: false, sealIntact: false, packageScore: 0,
  weightDiffG: 0, matchScore: 0, defectFound: false, testsPassed: false,
};

/** |dropped_off.weightG − ready_for_pickup.weightG| z ostatnich zdarzeń paczkomatu; brak zdarzeń → 0. */
export function weightDiffG(o: Order): number {
  const last = (t: 'dropped_off' | 'ready_for_pickup') => [...o.lockerEvents].reverse().find((e) => e.type === t);
  const a = last('dropped_off'), b = last('ready_for_pickup');
  return a && b ? Math.min(65535, Math.abs(a.weightG - b.weightG)) : 0;
}

export function measurementsFor(o: Order, unboxingVideoHash: string | null): { m: Measurements; found: boolean } {
  const report = verificationsOf(o.id, 'unboxing')
    .filter((v) => v.status === 'done' && v.report?.videoSha256 === unboxingVideoHash)
    .at(-1)?.report;
  if (!report?.measurements) return { m: INVALID, found: false };
  return { m: { ...report.measurements, weightDiffG: weightDiffG(o) }, found: true };
}

const running = new Set<string>();

export async function runOracle(orderId: string): Promise<void> {
  if (running.has(orderId)) return;
  running.add(orderId);
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const escrow = await readEscrow(orderId, true);
      if (escrow?.status !== 'Verifying') return;      // już rozstrzygnięte albo jeszcze nie zgłoszone
      const o = getOrder(orderId);
      const { m, found } = measurementsFor(o, escrow.unboxingVideoHash);
      try {
        const sig = await chain.submitVerdict(orderId, m);
        const fresh = getOrder(orderId);
        addTx(fresh, 'submit_verdict', sig);
        addTimeline(fresh, 'verdict_submitted', found
          ? 'Weryfikator przesłał pomiary z nagrania otwarcia do programu'
          : 'Brak ważnego raportu dla nagrania zapisanego on-chain: weryfikator przesłał „nagranie nieważne”', sig);
        const after = await chain.read(orderId);
        rememberEscrow(orderId, after);
        saveOrder(applyEscrow(fresh, after));
        return;
      } catch (e) {
        console.error(`[oracle] submit_verdict ${orderId}, próba ${attempt}:`, (e as Error).message);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  } finally {
    running.delete(orderId);
  }
}
