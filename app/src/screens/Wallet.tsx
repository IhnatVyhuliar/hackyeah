import React from 'react';
import { View } from 'react-native';
import { Txt, Label, Icon, Btn, Body, Dot, Row } from '../ui';
import { col, LINE } from '../theme';

export function Wallet({ p }: any) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' }}>
        <Txt s={20} w={600} style={{ flex: 1 }}>Portfel</Txt><Label c="var(--warning)">devnet</Label>
      </View>
      <Body gap={18}>
        <View>
          <Label>Saldo</Label>
          <Txt mono s={40} w={500} ls={-1.2} style={{ marginTop: 6 }}>{p.balance}</Txt>
          {p.balanceZl ? <Txt mono s={16} c="var(--fg-2)" style={{ marginTop: 4 }}>≈ {p.balanceZl}</Txt> : null}
          <Txt mono s={14} c="var(--fg-3)" style={{ marginTop: 10 }} selectable>{p.address || p.addrShort}</Txt>
        </View>
        {p.linkError ? <Txt s={14} w={500} c="var(--danger)">{p.linkError}</Txt> : null}
        {p.showRate ? <View style={{ gap: 6, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: LINE }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Row><Dot c={p.rateDot} /><Txt s={15} c="var(--fg-2)">Kurs 1 SOL</Txt></Row>
            <Txt mono s={15} w={500}>{p.rateText}</Txt>
          </View>
          <Txt s={13} c="var(--fg-3)" lh={1.45}>{p.rateSrc}</Txt>
        </View> : null}
        {p.hasEscrow ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <Row><Icon name="shield-check" size={16} color="var(--secured)" /><Txt s={15} c="var(--fg-2)">Zabezpieczone w umowach</Txt></Row>
            <Txt mono s={15} w={500} c="var(--secured)">{p.escrow}{p.escrowZl ? ' · ≈ ' + p.escrowZl : ''}</Txt>
          </View>
        ) : null}
        {p.solana ? <Btn kind="secondary" icon="droplet" label="Doładuj testowe SOL" onPress={p.faucet} /> : null}
        <View>
          <Label style={{ marginBottom: 4 }}>Historia</Label>
          {!p.hasHistory ? <Txt s={15} c="var(--fg-3)" style={{ paddingVertical: 12 }}>Jeszcze nic tu nie ma.</Txt> : null}
          {p.history.map((h: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: LINE }}>
              <View style={{ width: 36, height: 36, borderRadius: 36, backgroundColor: col('var(--surface-2)'), alignItems: 'center', justifyContent: 'center' }}><Icon name={h.icon} size={16} /></View>
              <Txt s={15} style={{ flex: 1 }}>{h.label}</Txt>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Txt mono s={15} c={h.color}>{h.amount}</Txt>
                {h.zl ? <Txt mono s={12} c="var(--fg-3)">≈ {h.zl}</Txt> : null}
              </View>
            </View>
          ))}
        </View>
      </Body>
    </View>
  );
}
