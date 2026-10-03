import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORTS, TIMEOUTS_DEMO, TIMEOUTS_PROD } from '@unbox/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

const ai = (env.AI ?? 'mock') as 'mock' | 'http';
if (!['mock', 'http'].includes(ai)) throw new Error(`AI=${ai}: dozwolone mock|http`);
const production = env.NODE_ENV === 'production';
const timeoutsMode = (env.TIMEOUTS ?? 'demo') as 'demo' | 'prod';
if (!['demo', 'prod'].includes(timeoutsMode)) throw new Error(`TIMEOUTS=${timeoutsMode}: dozwolone demo|prod`);
if (production && !env.JWT_SECRET) throw new Error('NODE_ENV=production wymaga JWT_SECRET');

export const config = {
  port: Number(env.PORT ?? PORTS.server),
  production,
  ai,
  aiUrl: (env.AI_URL ?? `http://localhost:${PORTS.oracle}`).replace(/\/$/, ''),
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 120_000),
  aiMaxAttempts: Number(env.AI_MAX_ATTEMPTS ?? 3),
  mockAiDelayMs: Number(env.MOCK_AI_DELAY_MS ?? 3000),
  timeoutsMode,
  timeouts: timeoutsMode === 'prod' ? TIMEOUTS_PROD : TIMEOUTS_DEMO,
  /** TEST-ONLY: przesuwanie zegara (POST /api/dev/clock). Nigdy przy NODE_ENV=production. */
  devClock: !production && (env.NODE_ENV === 'test' || env.ENABLE_DEV_CLOCK === '1'),
  sweepMs: Number(env.SWEEP_MS ?? 5000),
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me',
  publicBaseUrl: (env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? PORTS.server}`).replace(/\/$/, ''),
  validateResponses: !production,
  dataDir: path.resolve(env.DATA_DIR ?? path.join(here, '..', 'data')),
  maxUploadBytes: 60 * 1024 * 1024,
};

export const paths = {
  db: path.join(config.dataDir, 'unbox.db'),
  media: path.join(config.dataDir, 'media'),
  tmp: path.join(config.dataDir, 'tmp'),
};
