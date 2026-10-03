import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config';
import { sweepExpired } from './deals';
import { resumePendingAnalyses } from './disputes';
import { ApiErr, errorResponse } from './errors';
import { authRoutes } from './routes/auth';
import { dealRoutes } from './routes/deals';
import { healthRoutes } from './routes/health';
import { listingRoutes } from './routes/listings';
import { mediaApiRoutes, mediaPublicRoutes } from './routes/media';
import { seed } from './seed';

await seed();

const app = new Hono();
if (!process.env.QUIET) app.use(logger());
app.use(cors());
app.onError(errorResponse);
app.notFound((c) => errorResponse(new ApiErr('NOT_FOUND', 'Nie ma takiego endpointu'), c));

const api = new Hono()
  .route('/', healthRoutes).route('/', authRoutes).route('/', listingRoutes)
  .route('/', mediaApiRoutes).route('/', dealRoutes);
app.route('/api', api);
app.route('/', mediaPublicRoutes);

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`unbox API :${info.port}  AI=${config.ai}  TIMEOUTS=${config.timeoutsMode}${config.devClock ? '  DEV_CLOCK=on (test-only)' : ''}`);
});

// Terminy domyka backend: cyklicznie (i leniwie przy każdym odczycie transakcji).
setInterval(() => { try { sweepExpired(); } catch (e) { console.error('[sweep]', e); } }, config.sweepMs);
resumePendingAnalyses();
