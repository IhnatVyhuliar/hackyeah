import React from 'react';
import { View, Pressable } from 'react-native';
import { Txt, Label, Icon, Photo, Btn, Field, Body, Footer, Chip, ev } from '../ui';
import { col, LINE, LINE_STRONG } from '../theme';

export function Sell({ p }: any) {
  const f = p.form;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 20, justifyContent: 'center' }}><Txt s={20} w={600}>Nowe ogłoszenie</Txt></View>
      <Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {p.formPhotos.map((ph: any, i: number) => (
            <Pressable key={i} onPress={ph.remove} style={{ flex: 1 }} accessibilityLabel="Usuń zdjęcie"><Photo h={88} uri={ph.uri} /></Pressable>
          ))}
          {p.canAddPhoto ? (
            <Pressable onPress={p.addPhoto} accessibilityLabel="Zrób zdjęcie" style={{ flex: 1, maxWidth: '25%', height: 88, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: col('var(--fg-3)'), alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={22} color="var(--fg-3)" />
            </Pressable>
          ) : null}
        </View>
        {p.web ? <Txt s={13} c="var(--fg-3)">Zdjęcia robi się aparatem w aplikacji na telefonie. W przeglądarce ogłoszenie idzie bez zdjęć.</Txt> : null}
        <Field label="Tytuł" value={f.title} onChangeText={(t: string) => p.fTitle(ev(t))} placeholder="np. Kurtka jeansowa" />
        <Field label="Opis" value={f.desc} onChangeText={(t: string) => p.fDesc(ev(t))} placeholder="Krój, materiał, jak był noszony" multiline h={76} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Marka" value={f.brand} onChangeText={(t: string) => p.fBrand(ev(t))} />
          <Field style={{ flex: 1 }} label="Rozmiar" value={f.size} onChangeText={(t: string) => p.fSize(ev(t))} />
        </View>
        <View style={{ gap: 6 }}>
          <Label>Kategoria</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{p.formCats.map((c: any) => <Chip key={c.label} c={c} />)}</View>
        </View>
        <View style={{ gap: 6 }}>
          <Label>Stan</Label>
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, overflow: 'hidden' }}>
            {p.conds.map((c: any) => (
              <Pressable key={c.label} onPress={c.pick} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: col(c.bg) }}>
                <Txt s={14} w={500} c={c.fg}>{c.label}</Txt>
              </Pressable>
            ))}
          </View>
        </View>
        <View>
          <Label>Lista wad</Label>
          {p.formFlaws.map((fl: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: LINE }}>
              <Txt s={15} c="var(--fg-2)" style={{ flex: 1 }}>{fl.text}</Txt>
              <Pressable onPress={fl.remove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={16} color="var(--fg-3)" /></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 10 }}>
            <Field style={{ flex: 1 }} h={46} value={f.flawDraft} onChangeText={(t: string) => p.fFlaw(ev(t))} placeholder="Opisz wadę" />
            <Btn kind="outline" h={46} s={15} icon="plus" label="Dodaj" onPress={p.addFlaw} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Field label="Cena" mono suffix={p.unit} keyboardType="decimal-pad" value={f.price} onChangeText={(t: string) => p.fPrice(ev(t))} />
          {p.priceError ? <Txt s={14} w={500} c="var(--danger)">{p.priceError}</Txt> : null}
          <Txt s={13} c="var(--fg-3)" lh={1.45}>{p.formZl ? <Txt mono s={13} c="var(--fg-2)">≈ {p.formZl} </Txt> : null}{p.priceHint}</Txt>
        </View>
        {p.sellBlocked ? <Txt s={14} w={500} c="var(--warning)">{p.sellBlocked}</Txt> : null}
      </Body>
      <Footer center>
        <Label>Po zakupie opisu nie da się zmienić</Label>
        <Btn label="Wystaw" onPress={p.publish} disabled={p.cantPublish} style={{ alignSelf: 'stretch' }} />
      </Footer>
    </View>
  );
}
