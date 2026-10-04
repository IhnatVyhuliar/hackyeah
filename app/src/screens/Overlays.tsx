import React from 'react';
import { View, Pressable, ScrollView, TextInput } from 'react-native';
import { Txt, Label, Icon, Btn, Chip, KV, ExplorerLink, Row, ev } from '../ui';
import { col, F, PH, LINE, LINE_STRONG } from '../theme';

function Sheet({ onClose, children, z = 15, maxH = '88%', gap = 14 }: any) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: z, elevation: z, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' }}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={{ backgroundColor: col('var(--bg-screen)'), borderTopWidth: 1, borderColor: LINE_STRONG, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: maxH }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {onClose ? <View style={{ width: 40, height: 4, borderRadius: 4, backgroundColor: LINE_STRONG, alignSelf: 'center' }} /> : null}
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
const Title = ({ children }: any) => <Txt s={24} w={600} ls={-0.5} lh={1.15}>{children}</Txt>;

export function RoleStrip({ p }: any) {
  return (
    <View style={{ height: 34, paddingLeft: 20, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: LINE }}>
      <View style={{ width: 8, height: 8, borderRadius: 8, backgroundColor: p.roleBg }} />
      <Txt mono s={11} w={600} up ls={0.9} c="var(--fg-2)" style={{ flex: 1 }}>{p.roleLabel} · {p.modeLabel}</Txt>
      <Pressable accessibilityLabel="Menu deweloperskie" onPress={p.openDev} style={{ height: 34, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="settings-2" size={14} color="var(--fg-3)" /><Txt mono s={11} w={600} up ls={0.9} c="var(--fg-3)">Menu</Txt>
      </Pressable>
    </View>
  );
}

export function TabBar({ p }: any) {
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE, paddingBottom: 6, backgroundColor: col('var(--bg-screen)') }}>
      {p.tabs.map((t: any) => (
        <Pressable key={t.label} onPress={t.go} style={{ flex: 1, paddingTop: 12, paddingBottom: 4, alignItems: 'center', gap: 5 }}>
          <Icon name={t.icon} size={22} color={t.color} />
          <Txt mono s={11} w={600} up ls={0.4} c={t.color}>{t.label}</Txt>
          {t.badge ? <View style={{ position: 'absolute', top: 9, left: '58%', width: 9, height: 9, borderRadius: 9, backgroundColor: col('var(--warning)') }} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function Banner({ p }: any) {
  return (
    <Pressable onPress={p.bannerOpen} style={{ position: 'absolute', top: 40, left: 10, right: 10, zIndex: 20, elevation: 20, backgroundColor: col('var(--bg-screen)'), borderWidth: 2, borderColor: p.roleBg, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 10 }}>
      <Icon name="bell" size={20} color="var(--accent)" />
      <Txt s={15} w={500} lh={1.4} style={{ flex: 1 }}>{p.bannerText}</Txt>
    </Pressable>
  );
}

const RULES = [
  'Ucięte, zasłonięte lub słabe nagranie otwarcia → wygrywa sprzedający.',
  'Paczka inna niż na nagraniu nadania → wygrywa sprzedający.',
  'Przedmiot niezgodny z opisem albo wada spoza listy → zwrot dla kupującego.',
  'W pozostałych przypadkach → wygrywa sprzedający.',
];

export function BuySheet({ p }: any) {
  const L = p.L;
  return (
    <Sheet onClose={p.closeSheet} gap={12}>
      <Title>Potwierdź zakup</Title>
      <View>
        <KV k={L.title} v={<View style={{ alignItems: 'flex-end', gap: 2 }}><Txt mono s={15}>{L.priceText}</Txt>{L.zl ? <Txt mono s={12} c="var(--fg-3)">≈ {L.zl}</Txt> : null}</View>} />
        <KV k="Opłata za ochronę kupującego" v="0" vc="var(--secured)" />
        {p.solana ? <KV k="Opłata sieci" v={'≈ 0.000005 SOL · ' + p.feeZl} vc="var(--fg-2)" /> : null}
      </View>
      <Txt s={15} c="var(--fg-2)" lh={1.45}>Środki trafią do umowy, nie do nas. Jeśli paczka nie zostanie nadana do ok. {L.shipBy}, odbierzesz je sam.</Txt>
      <Txt s={15} lh={1.45}><Txt s={15} w={600}>Czego nie da się cofnąć: </Txt><Txt s={15} c="var(--fg-2)">po zapłacie nie wycofasz środków ręcznie. Wrócą do Ciebie tylko według reguł umowy.</Txt></Txt>
      <View style={{ borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 8, padding: 14, gap: 10 }}>
        <Txt s={15} lh={1.45}>Ewentualne spory oceni <Txt s={15} w={600}>Weryfikator AI</Txt> według jawnych reguł. Kupując, akceptujesz tego weryfikatora.</Txt>
        <Pressable onPress={p.toggleRules} style={{ minHeight: 32, justifyContent: 'center' }}><Txt s={15} w={600} c="var(--accent)">{p.rulesLabel}</Txt></Pressable>
        {p.rulesOpen ? (
          <View style={{ gap: 8 }}>
            {RULES.map((r, i) => <Row key={i} gap={10} center={false}><Txt mono s={14} c="var(--fg-3)">{i + 1}</Txt><Txt s={14} c="var(--fg-2)" lh={1.4} style={{ flex: 1 }}>{r}</Txt></Row>)}
            <Txt s={14} c="var(--fg-3)" lh={1.4}>Weryfikator może wskazać tylko kupującego albo sprzedającego. Nie ma dostępu do środków.{p.arbiterShort ? ' Klucz weryfikatora: ' : ''}{p.arbiterShort ? <Txt mono s={14} c="var(--fg-3)">{p.arbiterShort}</Txt> : null}</Txt>
          </View>
        ) : null}
      </View>
      {L.short ? <Txt s={15} w={500} c="var(--warning)">{p.solana ? 'Za mało środków. Doładuj testowe SOL w Portfelu.' : 'Za mało środków na saldzie demo.'}</Txt> : null}
      {L.blocked ? <Txt s={15} w={500} c="var(--warning)">{L.blockedReason}</Txt> : null}
      <Btn label={'Akceptuję i płacę ' + L.priceText} onPress={p.buy} disabled={L.short || L.blocked} />
      <Btn kind="ghost" h={44} s={16} label="Anuluj" onPress={p.closeSheet} />
    </Sheet>
  );
}

export function OkSheet({ p }: any) {
  const X = p.X;
  return (
    <Sheet onClose={p.closeSheet}>
      <Title>Przekazać {X.priceText} sprzedającemu?</Title>
      <Txt s={15} c="var(--fg-2)" lh={1.45}>{X.zl ? 'To ok. ' + X.zl + ' według bieżącego kursu. ' : ''}Tego nie da się cofnąć. Po potwierdzeniu nie złożysz już reklamacji, a nagranie otwarcia zostanie tylko na Twoim urządzeniu.</Txt>
      <Btn kind="mint" w={700} label={'Przekaż ' + X.priceText + ' sprzedającemu'} onPress={X.acceptConfirm} />
      <Btn kind="ghost" h={44} s={16} label="Wróć" onPress={p.closeSheet} />
    </Sheet>
  );
}

export function RetSheet({ p }: any) {
  const R = p.RT;
  return (
    <Sheet onClose={p.closeSheet}>
      <Title>Karta zwrotu odczytana. Oddać {R.priceText} kupującemu?</Title>
      <Txt s={15} c="var(--fg-2)" lh={1.45}>Potwierdzasz, że odebrałeś paczkę zwrotną. Środki z umowy wrócą do kupującego i umowa się zamknie. Tego nie da się cofnąć.</Txt>
      <Btn kind="mint" w={700} label={'Oddaj ' + R.priceText + ' kupującemu'} onPress={R.confirm} />
      <Btn kind="ghost" h={44} s={16} label="Wróć" onPress={p.closeSheet} />
    </Sheet>
  );
}

export function TxSheet({ p }: any) {
  const T = p.T;
  return (
    <Sheet z={30} gap={16}>
      {T.run ? (
        <>
          <Txt s={22} w={600} ls={-0.4} lh={1.15}>{T.title}</Txt>
          <View style={{ gap: 12 }}>
            {T.steps.map((s: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 14, height: 14, marginTop: 4, borderRadius: 14, borderWidth: 2, borderColor: col(s.color), backgroundColor: col(s.fill) }} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Txt s={16} w={s.weight} c={s.labelColor}>{s.label}</Txt>
                  {s.showBar ? <View style={{ height: 6, borderRadius: 6, backgroundColor: col('var(--surface-2)'), overflow: 'hidden' }}><View style={{ height: 6, width: s.pct, backgroundColor: col('var(--accent)') }} /></View> : null}
                  {s.hasDetail ? <Txt mono s={13} c="var(--fg-3)">{s.detail}</Txt> : null}
                </View>
              </View>
            ))}
          </View>
          <Txt s={14} c="var(--fg-3)">Nie zamykaj aplikacji. Sukces pokażemy dopiero po potwierdzeniu.</Txt>
        </>
      ) : null}
      {T.ok ? (
        <>
          <Row gap={12}><Icon name="circle-check" size={28} color="var(--secured)" /><Txt s={22} w={600} lh={1.15} style={{ flex: 1 }}>{T.okTitle}</Txt></Row>
          <Txt s={15} c="var(--fg-2)" lh={1.45}>{T.okText}</Txt>
          {T.hasHref ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE }}>
              <Txt mono s={13} c="var(--fg-3)">Potwierdzone ✓ · {T.sigShort}</Txt>
              <ExplorerLink href={T.href} label="Zobacz w Solana Explorer" strong />
            </View>
          ) : null}
          <Btn label="Gotowe" onPress={T.close} />
        </>
      ) : null}
      {T.fail ? (
        <>
          <Row gap={12}><Icon name="circle-alert" size={28} color="var(--danger)" /><Txt s={22} w={600} lh={1.15} style={{ flex: 1 }}>{T.failTitle}</Txt></Row>
          <Txt s={16} c="var(--fg-2)" lh={1.45}>{T.failText}</Txt>
          {T.hasCode ? <Txt mono s={12} c="var(--fg-3)">{T.code}</Txt> : null}
          {T.needFunds ? <Btn icon="droplet" label="Doładuj testowe SOL" onPress={T.topUp} /> : null}
          {T.retryable ? <Btn label="Spróbuj ponownie" onPress={T.retry} /> : null}
          <Btn kind="outline" h={48} s={16} label="Zamknij" onPress={T.close} />
        </>
      ) : null}
    </Sheet>
  );
}

const PRICE_CAPS = [0.03, 0.05, 0.08, 0.1, 1.5];

export function FilterSheet({ p }: any) {
  const cap = (x: number) => {
    const on = Math.abs(p.fMax - x) < 1e-9;
    return { label: x >= 1.5 ? 'Bez limitu' : x.toFixed(2), pick: () => p.setFMax(ev(String(x))), bg: on ? 'var(--fg-1)' : 'transparent', fg: on ? 'var(--ink-950)' : 'var(--fg-2)', border: on ? 'var(--fg-1)' : 'var(--line-strong)' };
  };
  return (
    <Sheet onClose={p.closeSheet} gap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>Filtry</Title>
        <Pressable onPress={p.clearFilters} style={{ minHeight: 44, justifyContent: 'center' }}><Txt s={15} w={600} c="var(--fg-2)">Wyczyść</Txt></Pressable>
      </View>
      <View style={{ gap: 10 }}><Label>Rozmiar</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{p.fSizes.map((c: any) => <Chip key={c.label} c={c} />)}</View></View>
      <View style={{ gap: 10 }}><Label>Stan</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{p.fConds.map((c: any) => <Chip key={c.label} c={c} />)}</View></View>
      {p.fPrice ? (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}><Label>Cena maks. (SOL)</Label><Txt mono s={14}>{p.fMaxText}</Txt></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PRICE_CAPS.map(x => <Chip key={x} c={cap(x)} />)}</View>
        </View>
      ) : null}
      <View style={{ gap: 10 }}><Label>Sortuj</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{p.fSorts.map((c: any) => <Chip key={c.label} c={c} />)}</View></View>
      <Pressable onPress={p.toggleNoFlaws} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE }}>
        <Txt s={16}>Tylko bez zgłoszonych wad</Txt>
        <View style={{ width: 48, height: 28, borderRadius: 28, backgroundColor: col(p.swBg) }}>
          <View style={{ position: 'absolute', top: 3, left: parseInt(p.swX, 10), width: 22, height: 22, borderRadius: 22, backgroundColor: '#FFFFFF' }} />
        </View>
      </Pressable>
      <Btn label={p.fResults} onPress={p.closeSheet} />
    </Sheet>
  );
}

export function DevSheet({ p }: any) {
  return (
    <Sheet onClose={p.closeSheet} z={25} gap={18}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}><Title>Menu deweloperskie</Title><Label>tylko devnet</Label></View>
      {p.hasDevMsg ? <Txt s={14} w={500} c="var(--secured)">{p.devMsg}</Txt> : null}
      <View style={{ gap: 10 }}>
        <Label>Konto na tym urządzeniu</Label>
        <View style={{ gap: 8 }}>
          {p.accounts.map((a: any) => <Pressable key={a.label} onPress={a.pick} style={{ height: 44, borderRadius: 999, borderWidth: 1, borderColor: LINE_STRONG, alignItems: 'center', justifyContent: 'center', backgroundColor: col(a.bg) }}><Txt s={15} w={600} c={a.fg}>{a.label}</Txt></Pressable>)}
        </View>
      </View>
      {!p.solanaMode ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 4 }}><Label>Czas serwera</Label><Txt mono s={24} w={500}>{p.clockNow}</Txt></View>
            <Btn kind="outline" h={44} s={15} icon="clock" label="Przesuń czas o 11 min" onPress={p.skip} />
          </View>
          <View style={{ gap: 10 }}>
            <Label>Wynik następnej oceny AI (serwer AI=mock)</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{p.scenarios.map((s: any) => <Chip key={s.label} h={40} c={s} />)}</View>
          </View>
        </>
      ) : (
        <View style={{ gap: 10 }}>
          <Label>Importuj portfel demo (plik solana-keygen)</Label>
          <TextInput value={p.walletJson} onChangeText={p.setWalletJson} placeholder="[12,34,…] – 64 liczby" placeholderTextColor={PH} multiline autoCapitalize="none"
            style={{ minHeight: 64, borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, padding: 10, color: col('var(--fg-1)'), fontFamily: F.mono[400], fontSize: 13 }} />
          <Btn kind="outline" h={44} s={15} label="Zapisz portfel" onPress={p.importWallet} />
        </View>
      )}
      <View>
        {p.env.map(([k, v]: any) => <KV key={k} k={k} v={<Txt mono s={12} c="var(--fg-2)" selectable style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Txt>} />)}
      </View>
      <Btn kind="outline" h={48} s={16} label="Wyloguj" onPress={p.logout} />
    </Sheet>
  );
}
