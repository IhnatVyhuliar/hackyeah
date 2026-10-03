// Ocena reklamacji: AI zwraca raport (pomiary), backend go waliduje, sprawdza hasze ocenionych nagrań,
// liczy werdykt deterministycznym decide() i dopiero wtedy zmienia stan transakcji.
// Błędny raport albo awaria AI nie zmieniają stanu: transakcja zostaje w Disputed (po terminie: neutralny zwrot).
import path from 'node:path';
import { type Analysis, type Deal, decide, hashDocument, OracleResponseSchema } from '@unbox/shared';
import { mockAi } from './ai/mockAi';
import { httpAi } from './ai/httpAi';
import type { AiAdapter, MockScenario } from './ai/types';
import { now } from './clock';
import { config, paths } from './config';
import { docs, tx } from './db';
import { applyAction, getDeal } from './deals';

export const ai: AiAdapter = config.ai === 'http' ? httpAi : mockAi;

const running = new Set<string>();
const scenarios = new Map<string, MockScenario>();   // AI=mock: scenariusz z nagłówka X-Demo-Scenario
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryMs = Number(process.env.AI_RETRY_MS ?? 2000);

const mediaUrl = (sha: string) => `${config.publicBaseUrl}/media/${sha}`;
const mediaPath = (sha: string) => path.join(paths.media, sha);

function setAnalysis(dealId: string, patch: Partial<Analysis>) {
  tx(() => {
    const d = getDeal(dealId);
    const base: Analysis = d.analysis ?? { status: 'pending', attempts: 0, error: null, report: null, reportHash: null,
      model: null, promptVersion: null, verdict: null, updatedAt: now() };
    docs.put('deal', dealId, { ...d, analysis: { ...base, ...patch, updatedAt: now() } });
  });
}

/** Sprawdza odpowiedź AI. Zwraca błąd (string) albo zweryfikowany raport. */
function verify(d: Deal, raw: unknown) {
  const r = OracleResponseSchema.safeParse(raw);
  if (!r.success) return { error: `Raport AI niezgodny ze schematem: ${r.error.issues.slice(0, 3).map((i) => i.path.join('.')).join(', ')}` };
  const ev = r.data.evidence;
  if (ev.packing_video_sha256 !== d.packingVideoSha256 || ev.unboxing_video_sha256 !== d.unboxingVideoSha256)
    return { error: 'Raport AI dotyczy innych nagrań niż zapisane w transakcji' };
  return { ok: r.data };
}

export function startAnalysis(dealId: string, scenario?: MockScenario) {
  if (scenario) scenarios.set(dealId, scenario);
  if (running.has(dealId)) return;
  running.add(dealId);
  void runAnalysis(dealId).finally(() => running.delete(dealId));
}

async function runAnalysis(dealId: string) {
  for (let attempt = (getDeal(dealId).analysis?.attempts ?? 0) + 1; attempt <= config.aiMaxAttempts; attempt++) {
    const d = getDeal(dealId);
    if (d.status !== 'Disputed') return;
    setAnalysis(dealId, { status: 'pending', attempts: attempt });
    let error: string;
    try {
      const raw = await ai.analyzeDispute({
        deal: d, complaint: d.complaint!, scenario: scenarios.get(dealId),
        packingVideo: { sha256: d.packingVideoSha256!, url: mediaUrl(d.packingVideoSha256!), path: mediaPath(d.packingVideoSha256!) },
        unboxingVideo: { sha256: d.unboxingVideoSha256!, url: mediaUrl(d.unboxingVideoSha256!), path: mediaPath(d.unboxingVideoSha256!) },
      });
      const v = verify(d, raw);
      if (v.ok) {
        const verdict = decide(v.ok.report);
        setAnalysis(dealId, { status: 'done', error: null, report: v.ok.report, reportHash: hashDocument(v.ok.report),
          model: v.ok.model, promptVersion: v.ok.prompt_version, verdict });
        try {
          applyAction(dealId, { type: 'resolve', verdict });
        } catch (e) {
          // np. termin oceny minął w trakcie analizy: raport zostaje zapisany, stan zmienia timeout.
          console.warn(`[disputes] ${dealId}: werdykt niezastosowany:`, (e as Error).message);
        }
        scenarios.delete(dealId);
        return;
      }
      error = v.error!;
    } catch (e) {
      error = `Błąd serwisu AI: ${(e as Error).message}`;
    }
    console.warn(`[disputes] ${dealId} próba ${attempt}/${config.aiMaxAttempts}: ${error}`);
    setAnalysis(dealId, { status: attempt >= config.aiMaxAttempts ? 'failed' : 'pending', error });
    if (attempt < config.aiMaxAttempts) await sleep(retryMs * attempt);
  }
}

/** Po restarcie: wznawia oceny, które nie skończyły się przed wyłączeniem serwera. */
export function resumePendingAnalyses() {
  for (const d of docs.list('deal')) {
    if (d.status === 'Disputed' && (!d.analysis || d.analysis.status === 'pending')) startAnalysis(d.id);
  }
}
