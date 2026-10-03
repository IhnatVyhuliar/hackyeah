import { Hono } from 'hono';
import { z } from 'zod';
import { HealthSchema } from '@unbox/shared';
import { advanceClock } from '../clock';
import { config } from '../config';
import { ai } from '../disputes';
import { parse, send } from '../errors';

export const healthRoutes = new Hono();

healthRoutes.get('/health', async (c) => {
  const h = await ai.health();
  return send(c, HealthSchema, { ok: h.ok, ai: h.detail, timeouts: config.timeoutsMode, version: '0.2.0' });
});

// TEST-ONLY, poza API dla aplikacji: przesuwa zegar backendu, żeby testować terminy.
// Rejestrowany tylko przy NODE_ENV=test albo ENABLE_DEV_CLOCK=1, nigdy przy NODE_ENV=production (inaczej 404).
if (config.devClock) {
  healthRoutes.post('/dev/clock', async (c) => {
    const { advanceSecs } = parse(z.object({ advanceSecs: z.int().min(0).max(30 * 86400) }), await c.req.json());
    return c.json({ testOnly: true, now: advanceClock(advanceSecs) });
  });
}
