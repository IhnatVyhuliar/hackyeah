// Portfel = saldo demo sklepu z backendu (GET /api/me/wallet). Bez blockchaina.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { type Deal, formatPln, type LedgerEntry, STATUS_LABELS_PL, type Wallet } from '@unbox/shared';
import { api, userMessage } from '../../src/api';
import { useSession } from '../../src/session';
import { Button, Card, colors, ErrorText, Loading, s } from '../../src/ui';

const LEDGER_LABEL: Record<LedgerEntry['type'], string> = {
  topup: 'Doładowanie', secure: 'Zabezpieczenie płatności', release: 'Wypłata', refund: 'Zwrot',
};
const when = (unix: number) => new Date(unix * 1000).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });

export default function WalletScreen() {
  const { user, logout } = useSession();
  const router = useRouter();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [held, setHeld] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, purchases] = await Promise.all([api.auth.wallet(), api.deals.list('buyer')]);
      setWallet(w);
      setHeld(purchases.filter((d) => d.payment.status === 'secured'));
      setError(null);
    } catch (e) {
      setError(userMessage(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const openDeal = (id: string) => router.push({ pathname: '/deal/[deal]', params: { deal: id } });

  if (!wallet && !error) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Text style={s.muted}>Zalogowano: {user?.name} ({user?.email})</Text>
      <ErrorText message={error} />
      {wallet && (
        <>
          <Card>
            <Text style={s.muted}>Dostępne saldo</Text>
            <Text style={s.big}>{formatPln(wallet.balanceMinor)}</Text>
            <Text style={s.muted}>Zabezpieczone w aktywnych zakupach: {formatPln(wallet.heldMinor)}</Text>
          </Card>

          {held.length > 0 && (
            <Card>
              <Text style={s.h2}>Środki zabezpieczone</Text>
              {held.map((d) => (
                <Pressable key={d.id} onPress={() => openDeal(d.id)} style={[s.row, { paddingVertical: 6 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.text}>{d.listing.title}</Text>
                    <Text style={s.muted}>{STATUS_LABELS_PL[d.status]}</Text>
                  </View>
                  <Text style={s.text}>{formatPln(d.payment.amountMinor)} ›</Text>
                </Pressable>
              ))}
            </Card>
          )}

          <Card>
            <Text style={s.h2}>Historia</Text>
            {wallet.ledger.length === 0 && <Text style={s.muted}>Brak operacji</Text>}
            {wallet.ledger.map((e) => (
              <Pressable key={e.id} disabled={!e.dealId} onPress={() => e.dealId && openDeal(e.dealId)}
                style={[s.row, { paddingVertical: 6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.text}>{LEDGER_LABEL[e.type]}</Text>
                  <Text style={s.muted}>{e.label} · {when(e.at)}</Text>
                </View>
                <Text style={[s.text, { color: e.amountMinor >= 0 ? colors.ok : colors.text }]}>
                  {e.amountMinor >= 0 ? '+' : ''}{formatPln(e.amountMinor)}{e.dealId ? ' ›' : ''}
                </Text>
              </Pressable>
            ))}
          </Card>
        </>
      )}
      <Button kind="secondary" title="Wyloguj" onPress={() => void logout()} />
    </ScrollView>
  );
}
