import { Hono } from 'hono';
import { z } from 'zod';
import { HealthSchema } from '@unbox/shared';
import { advanceClock } from '../clock';
import { config } from '../config';
import { dbOk } from '../db';
import { ai } from '../disputes';
import { parse, send } from '../errors';

export const healthRoutes = new Hono();

// Stan serwisu AI z pamięci podręcznej: odświeżany w tle najwyżej co AI_HEALTH_TTL_MS,
// więc health check nigdy nie czeka na AI.
let aiStatus = config.ai === 'mock' ? 'mock' : 'http (jeszcze nie sprawdzono)';
let aiCheckedAt = 0;
let aiChecking = false;
function refreshAiStatus() {
  if (config.ai === 'mock' || aiChecking || Date.now() - aiCheckedAt < config.aiHealthTtlMs) return;
  aiChecking = true;
  void ai.health().then((h) => { aiStatus = h.detail; }).finally(() => { aiCheckedAt = Date.now(); aiChecking = false; });
}

healthRoutes.get('/health', (c) => {
  refreshAiStatus();
  const db = dbOk();
  return send(c, HealthSchema, { ok: db, db: db ? 'ok' : 'error', ai: aiStatus, timeouts: config.timeoutsMode, version: '0.3.0' }, db ? 200 : 503);
});

// TEST-ONLY, poza API dla aplikacji: przesuwa zegar backendu, żeby testować terminy.
// Rejestrowany tylko przy NODE_ENV=test albo ENABLE_DEV_CLOCK=1, nigdy przy NODE_ENV=production (inaczej 404).
if (config.devClock) {
  healthRoutes.post('/dev/clock', async (c) => {
    const { advanceSecs } = parse(z.object({ advanceSecs: z.int().min(0).max(30 * 86400) }), await c.req.json());
    return c.json({ testOnly: true, now: advanceClock(advanceSecs) });
  });
}
