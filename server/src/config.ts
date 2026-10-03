import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, PublicKey } from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { PORTS } from '@sellsol/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;

function secretKey(name: string): Keypair | null {
  const v = env[name];
  if (!v) return null;
  const arr = JSON.parse(v.trim().startsWith('[') ? v : `[${v}]`) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

const chain = (env.CHAIN ?? 'mock') as 'mock' | 'devnet';
const ai = (env.AI ?? 'mock') as 'mock' | 'http';
if (!['mock', 'devnet'].includes(chain)) throw new Error(`CHAIN=${chain}: dozwolone mock|devnet`);
if (!['mock', 'http'].includes(ai)) throw new Error(`AI=${ai}: dozwolone mock|http`);

// W trybie mock PROGRAM_ID jest tylko etykietą (deterministyczny klucz), żeby escrowPda dało się policzyć.
const MOCK_PROGRAM_ID = Keypair.fromSeed(sha256(utf8ToBytes('sellsol_escrow mock'))).publicKey.toBase58();

export const config = {
  port: Number(env.PORT ?? PORTS.server),
  chain,
  ai,
  aiUrl: (env.AI_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS ?? 90_000),
  mockAiDelayMs: Number(env.MOCK_AI_DELAY_MS ?? 3000),
  rpcUrl: env.RPC_URL ?? 'https://api.devnet.solana.com',
  programId: new PublicKey(env.PROGRAM_ID || MOCK_PROGRAM_ID).toBase58(),
  cluster: chain === 'devnet' ? ('devnet' as const) : ('mock' as const),
  verifier: secretKey('VERIFIER_SECRET_KEY'),
  treasury: secretKey('TREASURY_SECRET_KEY'),
  demoMode: env.DEMO_MODE === '1' || env.DEMO_MODE === 'true',
  jwtSecret: env.JWT_SECRET ?? 'dev-only-secret-change-me',
  publicBaseUrl: (env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT ?? PORTS.server}`).replace(/\/$/, ''),
  validateResponses: env.NODE_ENV !== 'production',
  dataDir: path.resolve(env.DATA_DIR ?? path.join(here, '..', 'data')),
  fixturesDir: path.resolve(here, '..', '..', 'packages', 'shared', 'fixtures'),
  maxUploadBytes: 50 * 1024 * 1024,
};

export const paths = {
  db: path.join(config.dataDir, 'sellsol.db'),
  media: path.join(config.dataDir, 'media'),
  files: path.join(config.dataDir, 'files'),
  tmp: path.join(config.dataDir, 'tmp'),
};
