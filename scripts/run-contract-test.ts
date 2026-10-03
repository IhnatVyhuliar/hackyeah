// Uruchamia contract-test na świeżym backendzie (tymczasowa baza, wolny port), nie dotyka server/data.
import { spawnSync } from 'node:child_process';
import { startBackend } from '../server/test/harness';

const be = await startBackend({ MOCK_AI_DELAY_MS: '300', AI_RETRY_MS: '100', AI_MAX_ATTEMPTS: '2' });
let code = 1;
try {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/contract-test.ts', ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, API_URL: be.url },
  });
  code = r.status ?? 1;
} finally {
  await be.stop();
}
process.exit(code);
