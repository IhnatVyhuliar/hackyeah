import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config';
import { ApiErr, errorResponse } from './errors';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';
import { listingRoutes } from './routes/listings';
import { mediaRoutes } from './routes/media';
import { orderRoutes } from './routes/orders';
import { uploadRoutes } from './routes/uploads';
import { verificationRoutes } from './routes/verifications';
import { seed } from './seed';
import { startCranker } from './cranker';

await seed();

const app = new Hono();
app.use(logger());
app.use(cors());
app.onError(errorResponse);
app.notFound((c) => errorResponse(new ApiErr('NOT_FOUND', 'Nie ma takiego endpointu'), c));

const api = new Hono()
  .route('/', healthRoutes).route('/', authRoutes).route('/', listingRoutes)
  .route('/', uploadRoutes).route('/', orderRoutes).route('/', verificationRoutes);
app.route('/api', api);
app.route('/', mediaRoutes);

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`SellSol API :${info.port}  CHAIN=${config.chain} AI=${config.ai} DEMO_MODE=${config.demoMode ? 1 : 0}`);
  console.log(`  programId=${config.programId}  publicBaseUrl=${config.publicBaseUrl}`);
});

if (process.env.CRANKER === '1') startCranker();
