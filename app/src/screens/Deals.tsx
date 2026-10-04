import React from 'react';
import { View, Pressable } from 'react-native';
import { Txt, Label, Photo, Dot, Body } from '../ui';
import { col, LINE } from '../theme';

const Skeleton = () => (
  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: LINE }}>
    <View style={{ width: 60, height: 60, borderRadius: 4, backgroundColor: col('var(--surface-2)') }} />
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ height: 14, width: '70%', borderRadius: 2, backgroundColor: col('var(--surface-2)') }} />
      <View style={{ height: 10, width: '45%', borderRadius: 2, backgroundColor: col('var(--surface-2)') }} />
    </View>
  </View>
);

export function Deals({ p }: any) {
  const tab = (label: string, onPress: any, line: string, color: string) => (
    <Pressable onPress={onPress} style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: col(line), marginBottom: -1 }}>
      <Txt s={16} w={600} c={color}>{label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, justifyContent: 'center' }}><Txt s={20} w={600}>Transakcje</Txt></View>
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE }}>
          {tab('Zakupy', p.tabBuys, p.buysLine, p.buysColor)}
          {tab('Sprzedaże', p.tabSales, p.salesLine, p.salesColor)}
        </View>
      </View>
      <Body pt={16} gap={14}>
        {p.rowsLoading ? <><Label>Wczytuję umowy…</Label><Skeleton /><Skeleton /></> : null}
        {p.rows.map((r: any) => (
          <Pressable key={r.id} onPress={r.open} style={{ flexDirection: 'row', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: LINE, alignItems: 'center' }}>
            <Photo h={60} w={60} uri={r.photo} />
            <View style={{ flex: 1, gap: 6 }}>
              <Txt s={16} numberOfLines={1}>{r.title}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot c={r.statusColor} />
                <Txt mono s={12} w={600} up ls={0.5} c={r.statusColor} numberOfLines={1} style={{ flex: 1 }}>{r.statusLabel}</Txt>
              </View>
              {r.hasHint ? <Txt s={15} w={600} c="var(--accent)">{r.hint} →</Txt> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Txt mono s={15} w={500}>{r.priceText}</Txt>
              {r.zl ? <Txt mono s={12} c="var(--fg-3)">≈ {r.zl}</Txt> : null}
            </View>
          </Pressable>
        ))}
        {p.rowsEmpty ? <Txt s={16} c="var(--fg-3)" center style={{ paddingVertical: 40 }}>{p.rowsEmptyText}</Txt> : null}
      </Body>
    </View>
  );
}
