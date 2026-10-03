// Szczegóły transakcji (GET /api/deals/:id). Stan, terminy i płatność pochodzą z backendu;
// dostępne akcje liczy availableActions() z @unbox/shared, a backend i tak je weryfikuje.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import {
  COMPLAINT_LABELS_PL, type Deal, type DealAction, formatPln, type PaymentStatus, POLL_MS, STATUS_LABELS_PL,
} from '@unbox/shared';
import { api, userMessage } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Card, colors, ErrorText, Loading, s } from '../../src/ui';

const PAYMENT_PL: Record<PaymentStatus, string> = {
  secured: 'Zabezpieczona do zakończenia transakcji', released: 'Wypłacona sprzedającemu', refunded: 'Zwrócona kupującemu',
};
const ACTION_PL: Record<DealAction['type'], string> = {
  ship: 'Spakuj i nadaj (ekran sprzedającego)', accept: 'Nagraj otwarcie i potwierdź (ekran kupującego)',
  dispute: 'Zgłoś reklamację (ekran kupującego)', return: 'Odeślij zwrot (ekran kupującego)',
  confirm_return: 'Potwierdź zwrot (ekran sprzedającego)', resolve: '', expire: 'Odbierz środki',
};
const when = (unix: number) => new Date(unix * 1000).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

function left(deadline: number, now: number) {
  const sec = deadline - now;
  if (sec <= 0) return 'termin minął';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min ${sec % 60} s`;
}

const yes = (b: boolean) => (b ? 'tak' : 'nie');

export default function DealDetails() {
  const { deal: id } = useLocalSearchParams<{ deal: string }>();
  const { user } = useSession();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const load = useCallback(async () => {
    try { setDeal(await api.deals.get(id)); setError(null); } catch (e) { setError(userMessage(e)); }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  // W trakcie oceny reklamacji odświeżamy co POLL_MS.
  useEffect(() => {
    if (deal?.status !== 'Disputed') return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [deal?.status, load]);

  async function settle() {
    setBusy(true);
    try { setDeal(await api.flows.settleDeal(id)); setError(null); } catch (e) { setError(userMessage(e)); } finally { setBusy(false); }
  }

  if (!deal) return error ? <View style={s.center}><ErrorText message={error} /></View> : <Loading />;
  const role = deal.buyerId === user?.id ? 'kupujący' : 'sprzedający';
  const actions = user ? api.flows.actionsFor(deal, user.id, now) : [];
  const a = deal.analysis;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}>
      <ErrorText message={error} />
      <Card>
        <Text style={s.h1}>{deal.listing.title}</Text>
        <Text style={s.text}>{formatPln(deal.payment.amountMinor)} · {deal.listing.brand} · rozm. {deal.listing.size}</Text>
        <Text style={[s.h2, { marginTop: 8 }]}>{STATUS_LABELS_PL[deal.status]}</Text>
        {deal.deadlineAt != null && (
          <Text style={s.muted}>Termin: {when(deal.deadlineAt)} ({left(deal.deadlineAt, now)})</Text>
        )}
        <Text style={s.muted}>Twoja rola: {role}</Text>
      </Card>

      <Card>
        <Text style={s.h2}>Strony i płatność</Text>
        <Text style={s.text}>Sprzedający: {deal.seller.name}</Text>
        <Text style={s.text}>Kupujący: {deal.buyer.name}</Text>
        <Text style={s.text}>Płatność: {PAYMENT_PL[deal.payment.status]}</Text>
        {deal.trackingNumber && <Text style={s.text}>Przesyłka: {deal.trackingNumber}</Text>}
        {deal.returnTrackingNumber && <Text style={s.text}>Zwrot: {deal.returnTrackingNumber}</Text>}
        {deal.listing.defects.length > 0 && <Text style={s.muted}>Ujawnione wady: {deal.listing.defects.join('; ')}</Text>}
      </Card>

      {actions.length > 0 && (
        <Card>
          <Text style={s.h2}>Co teraz</Text>
          {actions.map((t) => t === 'expire'
            ? <Button key={t} title={busy ? 'Chwila…' : ACTION_PL.expire} onPress={() => void settle()} disabled={busy} />
            : <Text key={t} style={s.text}>• {ACTION_PL[t]}</Text>)}
        </Card>
      )}

      {deal.complaint && (
        <Card>
          <Text style={s.h2}>Reklamacja</Text>
          <Text style={s.text}>{COMPLAINT_LABELS_PL[deal.complaint.category]}</Text>
          <Text style={s.muted}>{deal.complaint.description}</Text>
        </Card>
      )}

      {a && (
        <Card>
          <Text style={s.h2}>Ocena AI</Text>
          {a.status === 'pending' && <Text style={s.text}>Trwa ocena nagrań… (próba {a.attempts})</Text>}
          {a.status === 'failed' && <Text style={[s.text, { color: colors.danger }]}>Ocena nie powiodła się: {a.error}</Text>}
          {a.verdict && (
            <Text style={[s.text, { fontWeight: '600' }]}>
              Werdykt: {a.verdict === 'BUYER' ? 'reklamacja uznana (zwrot towaru)' : 'reklamacja odrzucona (środki dla sprzedającego)'}
            </Text>
          )}
          {a.report && (
            <>
              <Text style={s.text}>{a.report.reasoning}</Text>
              <Text style={s.muted}>
                Nagranie kupującego ciągłe: {yes(a.report.buyer_recording.continuous)} · od zamkniętej paczki:{' '}
                {yes(a.report.buyer_recording.starts_with_sealed_package)} · jakość: {a.report.buyer_recording.quality}
              </Text>
              <Text style={s.muted}>
                Paczka zgodna z nadaną: {yes(a.report.package_matches_shipping_recording)} · przedmiot zgodny z ogłoszeniem:{' '}
                {yes(a.report.item_matches_listing)}
              </Text>
              {a.report.undisclosed_damage.present && (
                <Text style={s.muted}>Nieujawniona wada: {a.report.undisclosed_damage.description}</Text>
              )}
              <Text style={s.muted}>Model: {a.model} · prompt {a.promptVersion} · hash raportu {a.reportHash?.slice(0, 12)}…</Text>
            </>
          )}
        </Card>
      )}

      <Card>
        <Text style={s.h2}>Historia</Text>
        {[...deal.timeline].reverse().map((e, i) => (
          <View key={`${e.at}-${i}`} style={{ paddingVertical: 4 }}>
            <Text style={s.text}>{e.label}</Text>
            <Text style={s.muted}>{when(e.at)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
