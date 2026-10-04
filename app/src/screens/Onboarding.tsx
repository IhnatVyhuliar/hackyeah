import React from 'react';
import { View, ScrollView } from 'react-native';
import { Txt, Label, Wordmark, Btn, Icon, Notice, Field } from '../ui';
import { col, LINE } from '../theme';

const STEPS = [
  'Płacisz do umowy, nie do sprzedającego. Pieniądze czekają, aż odbierzesz paczkę.',
  'Nagrywasz otwarcie paczki. Reklamację ocenia Weryfikator AI według jawnych reguł.',
  'Gdy ktoś zniknie, po terminie sprawę może zamknąć każdy. Nikt nie musi się zgodzić.',
];

export function OnbLoading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Wordmark s={26} /></View>;
}

export function OnbWelcome({ p }: any) {
  const L = p.login;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
      <Wordmark s={26} />
      <Txt s={32} w={600} ls={-1} lh={1.06}>Używane ubrania od nieznajomych. Bez opłaty za ochronę.</Txt>
      <View style={{ flexDirection: 'row', width: 56, height: 3 }}>
        <View style={{ flex: 1, backgroundColor: col('var(--purple-500)') }} /><View style={{ flex: 1, backgroundColor: col('var(--mint-500)') }} />
      </View>
      <View>
        {STEPS.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: LINE, borderBottomWidth: i === STEPS.length - 1 ? 1 : 0, borderBottomColor: LINE }}>
            <Txt mono s={13} c="var(--fg-3)" style={{ paddingTop: 2 }}>{'0' + (i + 1)}</Txt>
            <Txt s={15} c="var(--fg-2)" lh={1.45} style={{ flex: 1 }}>{t}</Txt>
          </View>
        ))}
      </View>
      <View style={{ gap: 12 }}>
        <Field label="E-mail" value={L.email} onChangeText={L.setEmail} keyboardType="email-address" placeholder="np. ania@demo.pl" />
        <Field label="Hasło" value={L.password} onChangeText={L.setPassword} secure placeholder="hasło" />
        {L.hasError ? <Txt s={15} w={500} c="var(--danger)">{L.error}</Txt> : null}
        <Btn label="Zaloguj się" onPress={L.submit} disabled={!L.email || !L.password} />
      </View>
      <View style={{ gap: 8 }}>
        <Label>Konta demo · hasło demo1234</Label>
        {L.quick.map((q: any) => <Btn key={q.label} kind="outline" h={46} s={15} label={q.label} onPress={q.go} />)}
      </View>
      <Label style={{ textAlign: 'center' }}>{p.solana ? 'Sieć testowa · devnet' : 'Tryb demo · bez sieci'}</Label>
    </ScrollView>
  );
}

export function OnbCreating({ p }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
      <Txt s={24} w={600}>Łączę z kontem…</Txt>
      <Label>{p.solana ? 'Portfel powstaje na tym urządzeniu' : 'Tryb demo'}</Label>
    </View>
  );
}

export function OnbReady({ p }: any) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
        <Txt s={20} w={600} style={{ flex: 1 }}>Twój portfel</Txt><Label c="var(--warning)">{p.modeLabel}</Label>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="circle-check" size={20} color="var(--secured)" /><Txt s={16} c="var(--fg-2)">Zalogowano: {p.caption}</Txt></View>
        <View>
          <Label>Saldo</Label>
          <Txt mono s={40} w={500} ls={-1.2} style={{ marginTop: 6 }}>{p.balance}</Txt>
          {p.balanceZl ? <Txt mono s={16} c="var(--fg-2)" style={{ marginTop: 4 }}>≈ {p.balanceZl}</Txt> : null}
        </View>
        <View><Label>Adres</Label><Txt mono s={15} c="var(--fg-2)" style={{ marginTop: 6 }}>{p.addrShort}</Txt></View>
        {p.linkError ? <Notice tone="var(--danger)" icon="circle-alert" title="Portfel nie jest połączony z kontem" text={p.linkError} /> : null}
        {p.solana ? <Notice tone="var(--warning)" icon="droplet" title="Saldo jest potrzebne do każdej operacji" text="Każda operacja kosztuje ułamek grosza opłaty sieci. Bez salda nie potwierdzisz nawet odbioru paczki." /> : null}
        {p.solana ? <Txt s={14} c="var(--fg-3)" lh={1.45}>Portfel jest wbudowany w aplikację. Klucz zostaje tylko na tym urządzeniu – jego utrata oznacza utratę dostępu.</Txt> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 12 }}>
        {p.solana ? <Btn kind="secondary" icon="droplet" label="Doładuj testowe SOL" onPress={p.faucet} /> : null}
        <Btn label="Przeglądaj ogłoszenia" onPress={p.onbDone} />
      </View>
    </View>
  );
}
