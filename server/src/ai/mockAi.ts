// AI=mock: raporty z packages/shared/fixtures/reports.json według scenariusza (domyślnie "ok"), po ok. 3 s.
// Gdy fixtures jeszcze nie ma, używa wbudowanych raportów o tym samym kształcie.
import fs from 'node:fs';
import path from 'node:path';
import { type DemoScenario, type VerificationReport, VerificationReportSchema } from '@sellsol/shared';
import { config } from '../config';
import type { AiAdapter, AnalyzeInput } from './types';

type Key = 'packing' | DemoScenario;

function base(kind: 'packing' | 'unboxing'): VerificationReport {
  return {
    kind, orderId: '', videoSha256: '0'.repeat(64), durationMs: 24_000,
    seal: { detected: true, payloadMatch: true, firstSeenMs: 1200, lastSeenSealedMs: kind === 'packing' ? 22_000 : 6000, intact: true },
    continuity: { ok: true, sceneCutsMs: [], timestampGaps: [], maxSealGapMs: 400, issues: [] },
    productVisible: true, defects: [], extraTests: [{ testId: 't1', passed: true, note: 'Metka z rozmiarem M widoczna', frameMs: 9000 }],
    recordingValid: true, packingOk: kind === 'packing' ? true : null,
    measurements: kind === 'unboxing'
      ? { recordingValid: true, qrMatch: true, sealIntact: true, packageScore: 88, matchScore: 91, defectFound: false, testsPassed: true }
      : null,
    keyframes: [], reasons: [], engine: { version: 'mock-0.1', llm: null, processingMs: 0 },
  };
}

const BUILTIN: Record<Key, VerificationReport> = {
  packing: { ...base('packing'), reasons: ['Nagranie ciągłe, plomba odczytana i zgodna, przedmiot widoczny.'] },
  ok: { ...base('unboxing'), reasons: ['Plomba zgodna i nienaruszona, przedmiot zgodny z ofertą, brak wad.'] },
  defect: {
    ...base('unboxing'),
    defects: [{ label: 'Plama na lewym rękawie', severity: 'major', frameMs: 14_000, confidence: 0.82 }],
    measurements: { ...base('unboxing').measurements!, defectFound: true },
    reasons: ['Wykryto nieujawnioną wadę: plama na lewym rękawie.'],
  },
  swap: {
    ...base('unboxing'),
    seal: { detected: true, payloadMatch: false, firstSeenMs: 1100, lastSeenSealedMs: 5800, intact: false },
    measurements: { recordingValid: true, qrMatch: false, sealIntact: false, packageScore: 31, matchScore: 38, defectFound: false, testsPassed: false },
    extraTests: [{ testId: 't1', passed: false, note: 'Nie pokazano metki z rozmiarem M' }],
    reasons: ['Plomba nie pasuje do transakcji.', 'Paczka i przedmiot różnią się od nagrania pakowania.'],
  },
  invalid_recording: {
    ...base('unboxing'),
    continuity: { ok: false, sceneCutsMs: [7400], timestampGaps: [], maxSealGapMs: 3100, issues: ['Paczka poza kadrem przez 3,1 s'] },
    recordingValid: false,
    measurements: { ...base('unboxing').measurements!, recordingValid: false },
    reasons: ['Nagranie nieciągłe: cięcie w 7,4 s i paczka poza kadrem przez 3,1 s. Nagraj ponownie.'],
  },
};

function loadFixtures(): Partial<Record<Key, VerificationReport>> {
  const file = path.join(config.fixturesDir, 'reports.json');
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const out: Partial<Record<Key, VerificationReport>> = {};
    // Akceptujemy {packing, ok, defect, swap, invalid_recording} albo tablicę z polem "scenario".
    const entries: [string, unknown][] = Array.isArray(raw)
      ? raw.map((r: any) => [r.kind === 'packing' ? 'packing' : r.scenario, r.report ?? r])
      : Object.entries(raw as object);
    for (const [k, v] of entries) {
      const r = VerificationReportSchema.safeParse(v);
      if (r.success) out[k as Key] = r.data;
      else console.warn(`[mockAi] reports.json: pomijam "${k}" (niezgodny ze schematem)`);
    }
    return out;
  } catch (e) {
    console.warn('[mockAi] nie udało się wczytać reports.json, używam wbudowanych raportów', e);
    return {};
  }
}

const fixtures = loadFixtures();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function report(key: Key, i: AnalyzeInput): Promise<VerificationReport> {
  await sleep(config.mockAiDelayMs);
  const r = structuredClone(fixtures[key] ?? BUILTIN[key]);
  return { ...r, orderId: i.order.id, videoSha256: i.videoSha256,
           engine: { ...r.engine, processingMs: config.mockAiDelayMs } };
}

export const mockAi: AiAdapter = {
  kind: 'mock',
  analyzePacking: (i) => report('packing', i),
  analyzeUnboxing: (i) => report(i.scenario ?? 'ok', i),
  health: async () => ({ ok: true, llm: null }),
};
