// Uruchamia backend jako osobny proces na tymczasowej bazie (nigdy server/data) i wolnym porcie.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUnboxApi } from '@unbox/api-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const freePort = () => new Promise<number>((resolve) => {
  const srv = net.createServer().listen(0, '127.0.0.1', () => {
    const port = (srv.address() as net.AddressInfo).port;
    srv.close(() => resolve(port));
  });
});

export interface Backend { url: string; dataDir: string; stop(): Promise<void>; restart(): Promise<void>; log(): string }

export async function startBackend(env: Record<string, string> = {}, dataDir?: string): Promise<Backend> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'unbox-backend-test-'));
  let child: ChildProcess;
  let out = '';
  const fullEnv = { ...process.env, PORT: String(port), DATA_DIR: dir, AI: 'mock', MOCK_AI_DELAY_MS: '50', AI_RETRY_MS: '50',
    AI_MAX_ATTEMPTS: '1', ENABLE_DEV_CLOCK: '1', NODE_ENV: 'test', QUIET: '1', PUBLIC_BASE_URL: url, SWEEP_MS: '60000', ...env };

  async function boot() {
    child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: root, env: fullEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (b) => { out += b; });
    child.stderr?.on('data', (b) => { out += b; });
    for (let i = 0; i < 150; i++) {
      if (child.exitCode != null) throw new Error(`Backend zakończył się kodem ${child.exitCode}:\n${out}`);
      try { if ((await fetch(`${url}/api/health`)).status < 600) return; } catch { /* startuje */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Backend nie wystartował:\n${out}`);
  }
  const kill = () => new Promise<void>((r) => {
    if (child.exitCode != null) return r();
    child.once('exit', () => r());
    child.kill();
  });

  await boot();
  return {
    url, dataDir: dir, log: () => out,
    async stop() { await kill(); if (!dataDir) fs.rmSync(dir, { recursive: true, force: true }); },
    async restart() { await kill(); await boot(); },
  };
}

export const client = (url: string) => createUnboxApi({ baseUrl: url });
export type Client = ReturnType<typeof client>;

export async function as(url: string, email: string) {
  const c = client(url);
  const user = await c.auth.login({ email, password: 'demo1234' });
  return Object.assign(c, { user });
}

export const advance = (url: string, secs: number) =>
  fetch(`${url}/api/dev/clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ advanceSecs: secs }) });

export const blob = (type: string, bytes = 8 * 1024) => ({
  kind: 'blob' as const, blob: new Blob([crypto.getRandomValues(new Uint8Array(bytes))], { type }), name: 'x',
});

export async function codeOf(p: Promise<unknown>) {
  try { await p; return 'OK'; } catch (e) { return (e as { code?: string }).code ?? String(e); }
}

/** Ogłoszenie sprzedającego `seller` za `price` groszy. */
export async function listing(seller: Client, price: number) {
  const photo = await seller.media.upload(blob('image/jpeg'));
  return seller.listings.create({ title: 'Test', description: '', categoryId: 'inne', condition: 'dobry', brand: 'X', size: 'M',
    defects: [], photos: [{ url: photo.url, sha256: photo.sha256 }], priceMinor: price });
}

/** Zakup + nadanie; zwraca transakcję w stanie Shipped i treść QR z paczki. */
export async function shipped(seller: Client, buyer: Client, price: number) {
  const l = await listing(seller, price);
  const deal = await buyer.flows.purchaseListing(l.id);
  const qr = seller.flows.prepareShippingQr(deal.id);
  const d = await seller.flows.shipDeal(deal.id, { qrCommitment: qr.commitment, packingVideo: { source: blob('video/mp4') }, trackingNumber: 'INP1' });
  return { deal: d, payload: qr.payload };
}
