import type { Complaint, Deal } from '@unbox/shared';

/** Scenariusze AI=mock (nagłówek X-Demo-Scenario przy reklamacji). Ostatnie trzy to awarie do testów. */
export const MOCK_SCENARIOS = ['ok', 'defect', 'swap', 'invalid_recording', 'not_as_described',
  'invalid_report', 'wrong_evidence', 'ai_down'] as const;
export type MockScenario = typeof MOCK_SCENARIOS[number];

export interface DisputeEvidence {
  deal: Deal;
  packingVideo: { sha256: string; url: string; path: string };
  unboxingVideo: { sha256: string; url: string; path: string };
  complaint: Complaint;
  scenario?: MockScenario;
}

/**
 * Serwis AI tylko mierzy: zwraca surową odpowiedź (raport + hasze ocenionych plików).
 * Backend sam ją waliduje, sprawdza hasze i liczy werdykt przez decide().
 */
export interface AiAdapter {
  kind: 'mock' | 'http';
  analyzeDispute(e: DisputeEvidence): Promise<unknown>;
  health(): Promise<{ ok: boolean; detail: string }>;
}
