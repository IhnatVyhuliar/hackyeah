// The oracle report as the decide() rule path (CLAUDE.md §5): rows in the order decide() checks them.
// The model only measures; the outcome comes from the rule, so the screen shows the rule, not "AI decided".
import type { Analysis } from '@unbox/shared';

export interface VerdictRow { label: string; ok: boolean; detail: string }
export interface VerdictView { title: string; rows: VerdictRow[]; reasoning: string; byEvidence: boolean }

export function verdictView(d: { verdict?: 'Seller' | 'Buyer'; analysis?: Pick<Analysis, 'report' | 'reportHash'> | null }): VerdictView {
  const title = d.verdict === 'Buyer' ? 'Reklamacja uznana' : 'Reklamacja odrzucona';
  const r = d.analysis?.report;
  if (!r) {
    return { title, rows: [], byEvidence: true,
      reasoning: 'Rozstrzygnięte bez oceny nagrań: brakował plik albo jego treść nie zgadzała się z zapisem w umowie.' };
  }
  const b = r.buyer_recording, s = r.seller_recording, dmg = r.undisclosed_damage;
  const rows: VerdictRow[] = [
    { label: 'Nagranie otwarcia: ciągłe, od zamkniętej paczki, kod ujawniony przy otwarciu, dobra jakość',
      ok: b.continuous && b.starts_with_sealed_package && b.qr_revealed_on_opening && b.quality === 'good', detail: b.notes },
    { label: 'Nagranie pakowania: dobra jakość, ubranie widoczne, karta włożona',
      ok: s.quality === 'good' && s.item_clearly_visible && s.qr_card_packed, detail: s.notes },
    { label: 'Paczka zgodna z nagraniem nadania', ok: r.package_matches_shipping_recording, detail: '' },
    { label: 'Przedmiot zgodny z opisem', ok: r.item_matches_listing, detail: '' },
    { label: 'Nieujawniona wada', ok: !dmg.present,
      detail: dmg.present ? [dmg.description, ...dmg.timestamps].filter(Boolean).join(' · ') : '' },
  ];
  return { title, rows, reasoning: r.reasoning, byEvidence: false };
}
