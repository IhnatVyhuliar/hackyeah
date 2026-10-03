import { Hono } from 'hono';
import { z } from 'zod';
import { HealthSchema } from '@sellsol/shared';
import { advanceMockClock } from '../chain/mockChain';
import { config } from '../config';
import { ApiErr, parse, send } from '../errors';
import { ai, chain } from '../orders';

export const healthRoutes = new Hono();

healthRoutes.get('/health', async (c) => {
  const [chainOk, aiHealth] = await Promise.all([chain.health(), ai.health()]);
  return send(c, HealthSchema, {
    ok: chainOk && aiHealth.ok,
    chain: chainOk ? config.chain : `${config.chain} (niedostępny)`,
    ai: aiHealth.ok ? `${config.ai}${aiHealth.llm ? ` (${aiHealth.llm})` : ''}` : `${config.ai} (niedostępny)`,
    programId: config.programId,
    cluster: config.cluster,
  });
});

// TEST-ONLY, poza kontraktem: "zegar demo" symulowanego łańcucha do testów timeoutów.
// Rejestrowany wyłącznie przy CHAIN=mock; przy każdym innym łańcuchu endpoint nie istnieje (404).
// Przesuwa tylko zegar fakeChain; na devnecie terminy liczy program z Clock::get().
if (config.chain === 'mock') {
  healthRoutes.post('/dev/clock', async (c) => {
    if (config.chain !== 'mock') throw new ApiErr('NOT_FOUND', 'Nie ma takiego endpointu');   // druga blokada
    const { advanceSecs } = parse(z.object({ advanceSecs: z.int().min(0).max(30 * 86400) }), await c.req.json());
    return c.json({ testOnly: true, chainNow: advanceMockClock(advanceSecs) });
  });
}
