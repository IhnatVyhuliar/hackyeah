// Opcjonalny cranker (CRANKER=1): co 30 s wywołuje claim_timeout dla escrow po terminie.
// Pokazuje, że "każdy może": instrukcja jest bez uprawnień, a wynik liczy program.
import { timeoutOutcome } from '@sellsol/shared';
import { docs } from './db';
import { addTimeline, addTx, applyEscrow, chain, readEscrow, saveOrder } from './orders';

export function startCranker(everyMs = 30_000) {
  setInterval(async () => {
    const now = await chain.now().catch(() => null);
    if (now == null) return;
    for (const o of docs.list('order')) {
      if (o.chainStatus === 'none' || o.chainStatus === 'Released' || o.chainStatus === 'Refunded') continue;
      try {
        const e = await readEscrow(o.id, true);
        if (!e || !timeoutOutcome(e, now)) continue;
        const sig = await chain.claimTimeout(o.id);
        addTx(o, 'claim_timeout', sig);
        addTimeline(o, 'claim_timeout', 'Cranker wywołał claim_timeout po upływie terminu', sig);
        saveOrder(applyEscrow(o, await readEscrow(o.id, true)));
      } catch (err) {
        console.warn(`[cranker] ${o.id}:`, (err as Error).message);
      }
    }
  }, everyMs);
  console.log('[cranker] włączony');
}
