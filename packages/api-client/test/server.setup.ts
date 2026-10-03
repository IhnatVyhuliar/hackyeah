// Uruchamia prawdziwy backend (server/) na czystej bazie w katalogu tymczasowym, AI=mock, zegar testowy.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.env.TEST_API_PORT ?? 4317);
let child: ChildProcess | null = null;
let dataDir = '';

export async function setup(project: TestProject) {
  const url = `http://127.0.0.1:${PORT}`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-api-test-'));
  child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AI: 'mock', MOCK_AI_DELAY_MS: '200', AI_RETRY_MS: '100',
           AI_MAX_ATTEMPTS: '2', ENABLE_DEV_CLOCK: '1', NODE_ENV: 'test', QUIET: '1', PUBLIC_BASE_URL: url },
  });
  let log = '';
  child.stdout?.on('data', (b) => { log += b; });
  child.stderr?.on('data', (b) => { log += b; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) { project.provide('apiUrl', url); return; } } catch { /* jeszcze startuje */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Backend nie wystartował:\n${log}`);
}

export async function teardown() {
  child?.kill();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(dataDir, { recursive: true, force: true });
}

declare module 'vitest' {
  export interface ProvidedContext { apiUrl: string }
}
