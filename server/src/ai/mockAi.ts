// AI=mock: gotowe raporty według scenariusza (domyślnie "ok"), po MOCK_AI_DELAY_MS. Do testów i demo bez AI.
import type { OracleReport } from '@unbox/shared';
import { config } from '../config';
import type { AiAdapter, DisputeEvidence, MockScenario } from './types';

const good: OracleReport = {
  buyer_recording: { continuous: true, starts_with_sealed_package: true, qr_revealed_on_opening: true, quality: 'good',
                     notes: 'Nagranie ciągłe od zamkniętej paczki, QR widoczny po otwarciu.' },
  seller_recording: { item_clearly_visible: true, qr_card_packed: true, package_sealed_and_labeled: true, quality: 'good',
                      notes: 'Przedmiot dobrze widoczny, karta QR włożona, paczka zaklejona i oznaczona.' },
  package_matches_shipping_recording: true,
  item_matches_listing: true,
  undisclosed_damage: { present: false, description: '', timestamps: [] },
  reasoning: 'Przedmiot zgodny z ogłoszeniem, brak nieujawnionych wad.',
};

const REPORTS: Record<Exclude<MockScenario, 'invalid_report' | 'wrong_evidence' | 'ai_down'>, OracleReport> = {
  ok: good,
  defect: { ...good,
    undisclosed_damage: { present: true, description: 'Plama na lewym rękawie, nieujawniona w ogłoszeniu.', timestamps: ['0:14'] },
    reasoning: 'Na nagraniu otwarcia widać plamę na rękawie, której nie ma na liście wad.' },
  not_as_described: { ...good, item_matches_listing: false,
    reasoning: 'Rozmiar na metce (L) nie zgadza się z ogłoszeniem (M).' },
  swap: { ...good, package_matches_shipping_recording: false, item_matches_listing: false,
    reasoning: 'Paczka na nagraniu otwarcia ma inną taśmę i etykietę niż nadana przez sprzedającego.' },
  invalid_recording: { ...good,
    buyer_recording: { ...good.buyer_recording, continuous: false, quality: 'poor', notes: 'Cięcie w 0:07, paczka poza kadrem.' },
    undisclosed_damage: { present: true, description: 'Możliwa plama', timestamps: ['0:20'] },
    reasoning: 'Nagranie otwarcia nieciągłe, więc nie dowodzi stanu przy otwarciu.' },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockAi: AiAdapter = {
  kind: 'mock',
  async analyzeDispute(e: DisputeEvidence) {
    await sleep(config.mockAiDelayMs);
    const s = e.scenario ?? 'ok';
    if (s === 'ai_down') throw new Error('Serwis AI niedostępny (scenariusz testowy)');
    const evidence = { packing_video_sha256: e.packingVideo.sha256, unboxing_video_sha256: e.unboxingVideo.sha256 };
    if (s === 'invalid_report') return { report: { reasoning: 'brak pól' }, model: 'mock', prompt_version: 'v1', evidence };
    if (s === 'wrong_evidence')
      return { report: REPORTS.defect, model: 'mock', prompt_version: 'v1', evidence: { ...evidence, unboxing_video_sha256: 'f'.repeat(64) } };
    return { report: REPORTS[s], model: 'mock', prompt_version: 'v1', evidence };
  },
  health: async () => ({ ok: true, detail: 'mock' }),
};
