import type { ConfigBounds, Thresholds, Windows } from './types';

export const SOL_PLN_DEMO_RATE = 600;           // kurs poglądowy: 1 SOL = 600 zł
export const LAMPORTS_PER_SOL = 1_000_000_000;
export const DEFAULT_THRESHOLDS: Thresholds = { minMatchScore: 70, minPackageScore: 60, weightTolG: 150 };
export const DEFAULT_WINDOWS: Windows = { shipWindowSecs: 1800, openWindowSecs: 1800 };
export const POLL_MS = 2000;
export const PORTS = { server: 4000, ai: 8000, metro: 8081, landing: 5173 } as const;

export const SEAL_PREFIX = 'SELLSOL1';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Konfiguracja programu na devnecie (KONTRAKT §5.5); fakeChain używa tych samych wartości.
export const DEMO_FEE_BPS = 100;
export const DEMO_CONFIG_BOUNDS: ConfigBounds = {
  minShipWindow: 60, maxShipWindow: 1_209_600,
  minOpenWindow: 60, maxOpenWindow: 1_209_600,
  verdictWindow: 600,
};
