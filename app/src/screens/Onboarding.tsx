import React from 'react';
import { View, ScrollView } from 'react-native';
import { Txt, Label, Wordmark, Btn, Icon, Notice } from '../ui';
import { col, LINE } from '../theme';

const STEPS = [
  'Płacisz do umowy, nie do sprzedającego. Pieniądze czekają, aż odbierzesz paczkę.',
  'Nagrywasz otwarcie paczki. Reklamację ocenia AI według jawnych reguł.',
  'Gdy ktoś zniknie, po terminie sprawę może zamknąć każdy. Nikt nie musi się zgodzić.',
];

export function OnbWelcome({ p }: any) {
  return (
    <View style={{ flex: 1, padding: 20, paddingBottom: 24, gap: 24 }}>
      <Wordmark s={26} />
      {/* Scrolls on short screens instead of overflowing upwards onto the wordmark. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', gap: 20 }} showsVerticalScrollIndicator={false}>
        <Txt s={36} w={600} ls={-1.1} lh={1.06}>Używane ubrania od nieznajomych. Bez opłaty za ochronę.</Txt>
        <View style={{ flexDirection: 'row', width: 56, height: 3 }}>
          <View style={{ flex: 1, backgroundColor: col('var(--purple-500)') }} /><View style={{ flex: 1, backgroundColor: col('var(--mint-500)') }} />
        </View>
        <View>
          {STEPS.map((t, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: LINE, borderBottomWidth: i === STEPS.length - 1 ? 1 : 0, borderBottomColor: LINE }}>
              <Txt mono s={13} c="var(--fg-3)" style={{ paddingTop: 2 }}>{'0' + (i + 1)}</Txt>
              <Txt s={16} c="var(--fg-2)" lh={1.45} style={{ flex: 1 }}>{t}</Txt>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ gap: 12 }}>
        <Btn label="Utwórz portfel" onPress={p.onbStart} />
        <Label style={{ textAlign: 'center' }}>Sieć testowa · devnet</Label>
      </View>
    </View>
  );
}

export function OnbCreating() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 }}>
      <Txt s={24} w={600}>Tworzę portfel…</Txt>
      <Label>Klucz zostaje na tym telefonie</Label>
    </View>
  );
}

export function OnbReady({ p }: any) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
        <Txt s={20} w={600} style={{ flex: 1 }}>Twój portfel</Txt><Label c="var(--warning)">devnet</Label>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="circle-check" size={20} color="var(--secured)" /><Txt s={16} c="var(--fg-2)">Portfel gotowy</Txt></View>
        <View>
          <Label>Saldo</Label>
          <Txt mono s={44} w={500} ls={-1.3} style={{ marginTop: 6 }}>{p.balance}<Txt mono s={18} c="var(--fg-3)"> SOL</Txt></Txt>
          <Txt mono s={16} c="var(--fg-2)" style={{ marginTop: 4 }}>≈ {p.balanceZl}</Txt>
        </View>
        <View><Label>Adres</Label><Txt mono s={15} c="var(--fg-2)" style={{ marginTop: 6 }}>{p.addrShort}</Txt></View>
        <Notice tone="var(--warning)" icon="droplet" title="Saldo jest potrzebne do każdej operacji" text="Każda operacja kosztuje ułamek grosza opłaty sieci. Bez salda nie potwierdzisz nawet odbioru paczki." />
        <Txt s={14} c="var(--fg-3)" lh={1.45}>Portfel jest wbudowany w aplikację. Klucz zostaje tylko na tym telefonie – jego utrata oznacza utratę dostępu.</Txt>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 12 }}>
        <Btn kind="secondary" icon="droplet" label="Doładuj testowe SOL" onPress={p.faucet} />
        <Btn label="Przeglądaj ogłoszenia" onPress={p.onbDone} />
      </View>
    </View>
  );
}
