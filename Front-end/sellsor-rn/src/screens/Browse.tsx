import React from 'react';
import { View, Pressable, TextInput, ScrollView, FlatList } from 'react-native';
import { Txt, Label, Wordmark, Icon, Chip, Photo, Notice, Btn, ev } from '../ui';
import { col, F, PH, LINE, LINE_STRONG } from '../theme';

function Card({ l }: any) {
  return (
    <Pressable onPress={l.open} style={{ width: '48%' }}>
      <Photo h={178} label={l.cat} />
      <View style={{ paddingTop: 10, gap: 3 }}>
        <Txt s={15} numberOfLines={1}>{l.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <Txt mono s={15} w={500}>{l.priceText} SOL</Txt>
          <Txt mono s={12} c="var(--fg-3)">≈ {l.zl}</Txt>
        </View>
        <Txt mono s={11} w={500} up ls={0.6} c="var(--fg-3)" numberOfLines={1}>{l.meta}</Txt>
      </View>
    </Pressable>
  );
}

export function Browse({ p }: any) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Wordmark s={24} /></View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt mono s={13} w={500}>{p.balance} SOL</Txt>
          <Txt mono s={11} c="var(--fg-3)">≈ {p.balanceZl}</Txt>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, height: 46, borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, backgroundColor: col('var(--surface-1)'), flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4 }}>
          <Icon name="search" size={18} color="var(--fg-3)" />
          <TextInput value={p.q} onChangeText={t => p.setQ(ev(t))} placeholder="Szukaj marki, rzeczy…" placeholderTextColor={PH} returnKeyType="search" autoCorrect={false}
            style={{ flex: 1, color: col('var(--fg-1)'), fontFamily: F.sans[400], fontSize: 16, paddingVertical: 0 }} />
          {p.hasQ ? <Pressable onPress={p.clearQ} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} color="var(--fg-2)" /></Pressable> : null}
        </View>
        <Pressable onPress={p.openFilters} style={{ height: 46, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: col(p.fBorder), flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="sliders-horizontal" size={16} />
          <Txt s={15} w={600}>Filtry</Txt>
          {p.hasFCount ? <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 20, backgroundColor: col('var(--accent)'), alignItems: 'center', justifyContent: 'center' }}><Txt mono s={12} c="#FFFFFF">{p.fCount}</Txt></View> : null}
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}>
        {p.cats.map((c: any) => <Chip key={c.label} c={c} />)}
      </ScrollView>

      <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: LINE }}>
        {p.feedLoading ? (
          <View style={{ padding: 20, paddingTop: 14, gap: 14 }}>
            <Label>Wczytuję ogłoszenia z sieci…</Label>
            {[0, 1].map(i => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, height: 180, borderRadius: 4, backgroundColor: col('var(--surface-2)') }} />
                <View style={{ flex: 1, height: 180, borderRadius: 4, backgroundColor: col('var(--surface-2)') }} />
              </View>
            ))}
          </View>
        ) : null}
        {p.feedError ? (
          <View style={{ padding: 20, paddingTop: 38 }}>
            <Notice tone="var(--danger)" icon="wifi-off" title="Nie udało się wczytać ogłoszeń" text="Sieć testowa ma limity zapytań i chwilowo nie odpowiada. Twoje środki i umowy są bez zmian.">
              <Btn kind="outline" h={48} s={16} label="Spróbuj ponownie" onPress={p.reload} />
            </Notice>
          </View>
        ) : null}
        {p.feedOk ? (
          <FlatList
            data={p.feed}
            keyExtractor={(l: any, i) => l.title + i}
            numColumns={2}
            columnWrapperStyle={{ justifyContent: 'space-between' }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, gap: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{p.resultsLabel}</Label><Label>{p.sortLabel}</Label></View>}
            ListEmptyComponent={
              <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
                <Txt s={18} w={600}>Nic nie pasuje do wyszukiwania</Txt>
                <Txt s={15} c="var(--fg-3)">Zmień frazę albo poluzuj filtry.</Txt>
                <Btn kind="outline" h={44} s={15} label="Wyczyść filtry" onPress={p.clearFilters} />
              </View>
            }
            renderItem={({ item }) => <Card l={item} />}
          />
        ) : null}
      </View>
    </View>
  );
}
