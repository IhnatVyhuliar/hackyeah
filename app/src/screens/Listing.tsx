import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Txt, Label, Icon, Photo, Btn, Footer, Row } from '../ui';
import { col, LINE } from '../theme';

export function Listing({ p }: any) {
  const L = p.L;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <Photo h={380} label={L.photoLabel} uri={L.photo} style={{ borderRadius: 0, borderWidth: 0 }} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row' }}>
        <Pressable onPress={p.back} style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: col('var(--scrim)'), borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chevron-left" size={22} />
        </Pressable>
      </View>
      <View style={{ height: 268 }} />
      <ScrollView style={{ flex: 1, backgroundColor: col('var(--bg-screen)') }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Label>{L.brandLine}</Label>
        <Txt s={26} w={600} ls={-0.8} lh={1.1}>{L.title}</Txt>
        <Txt s={15} c="var(--fg-2)" lh={1.45}>{L.desc}</Txt>
        <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, gap: 8 }}>
          <Label>Wady zgłoszone przez sprzedającego · {L.flawsCount}</Label>
          {L.flaws.map((f: string) => <Txt key={f} s={15} c="var(--fg-2)"><Txt c="var(--fg-3)">— </Txt>{f}</Txt>)}
          {L.noFlaws ? <Txt s={15} c="var(--fg-3)">Brak zgłoszonych wad</Txt> : null}
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, gap: 6 }}>
          <Label>Sprzedaje</Label>
          <Txt s={15} c="var(--fg-2)">{L.sellerLine}</Txt>
        </View>
      </ScrollView>
      <Footer border>
        {L.notOwn && L.blocked ? <Txt s={14} w={500} c="var(--warning)">{L.blockedReason}</Txt> : null}
        <Row><Icon name="shield-check" size={16} color="var(--secured)" /><Txt s={14} c="var(--fg-2)" style={{ flex: 1 }}>Środki trafią do umowy, nie do nas. Bez opłaty za ochronę.</Txt></Row>
        <Row gap={16}>
          <View>
            <Txt mono s={22} w={500}>{L.priceText}</Txt>
            {L.zl ? <Txt mono s={12} c="var(--fg-3)" style={{ marginTop: 2 }}>≈ {L.zl} · orientacyjnie</Txt> : null}
          </View>
          {L.notOwn ? <Btn label="Kup" onPress={p.openBuy} disabled={L.blocked} style={{ flex: 1 }} /> : <Label style={{ flex: 1, textAlign: 'right' }}>To Twoje ogłoszenie</Label>}
        </Row>
      </Footer>
    </View>
  );
}
