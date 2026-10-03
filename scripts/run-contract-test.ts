// Black-box contract test backendu (Rust, server/) na świeżej bazie w katalogu tymczasowym i wolnym porcie.
// Nie dotyka server/data. Z ustawionym API_URL testuje już działający serwer (z ENABLE_DEV_CLOCK=1 AI=mock).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const runTest = (apiUrl: string) =>
  spawnSync(process.execPath, ['--import', 'tsx', 'scripts/contract-test.ts', ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, API_URL: apiUrl },
  }).status ?? 1;

if (process.env.API_URL) process.exit(runTest(process.env.API_URL));

const freePort = () => new Promise<number>((resolve) => {
  const srv = net.createServer().listen(0, '127.0.0.1', () => {
    const port = (srv.address() as net.AddressInfo).port;
    srv.close(() => resolve(port));
  });
});

const build = spawnSync('cargo', ['build', '--quiet', '--manifest-path', 'server/Cargo.toml'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) {
  console.error('cargo build nie powiódł się (potrzebny toolchain Rusta; alternatywnie uruchom serwer i podaj API_URL)');
  process.exit(build.status ?? 1);
}
const bin = path.join(root, 'server', 'target', 'debug', process.platform === 'win32' ? 'unbox-server.exe' : 'unbox-server');
const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-contract-'));
const child = spawn(bin, [], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, AI: 'mock', MOCK_AI_DELAY_MS: '300', AI_RETRY_MS: '100',
         AI_MAX_ATTEMPTS: '2', ENABLE_DEV_CLOCK: '1', NODE_ENV: 'test', QUIET: '1', PUBLIC_BASE_URL: url, JWT_SECRET: '' },
});
let code = 1;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${url}/api/health`)).ok) break; } catch { /* startuje */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  code = runTest(url);
} finally {
  child.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(code);
