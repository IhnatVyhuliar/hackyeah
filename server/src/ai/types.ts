import type { DemoScenario, Hex32, Markers, Order, VerificationReport } from '@sellsol/shared';

export interface AnalyzeInput {
  order: Order;
  videoPath: string;
  videoSha256: Hex32;
  markers: Markers;
  scenario?: DemoScenario;           // tylko AI=mock (nagłówek X-Demo-Scenario)
}

/** Serwis AI tylko mierzy. Nigdy nie zwraca "wypłać" ani "zwróć". */
export interface AiAdapter {
  kind: 'mock' | 'http';
  analyzePacking(i: AnalyzeInput): Promise<VerificationReport>;
  analyzeUnboxing(i: AnalyzeInput): Promise<VerificationReport>;
  health(): Promise<{ ok: boolean; llm: string | null }>;
}
