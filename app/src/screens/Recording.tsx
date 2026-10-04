import React from 'react';
import { View, Pressable, TextInput, Image, StyleSheet } from 'react-native';
import { Txt, Label, Icon, Photo, Btn, Notice, Header, Body, Footer, Chip, Field, Row, ev, FILL } from '../ui';
import { col, F, PH, LINE, LINE_STRONG } from '../theme';

export function Brief({ p }: any) {
  const B = p.B;
  return (
    <View style={{ flex: 1 }}>
      <Header title="Zanim nagrasz" onBack={p.back} />
      <Body>
        <Txt s={26} w={600} ls={-0.8} lh={1.1}>{B.title}</Txt>
        <View>
          {B.items.map((it: any) => (
            <View key={it.n} style={{ flexDirection: 'row', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE }}>
              <Txt mono s={13} c="var(--fg-3)" style={{ paddingTop: 2 }}>{it.n}</Txt><Txt s={16} lh={1.4} style={{ flex: 1 }}>{it.text}</Txt>
            </View>
          ))}
        </View>
        <Notice bw={2} tone="var(--warning)" icon="triangle-alert" title="Ta reguła działa przeciwko autorowi" text={B.warning} />
      </Body>
      <Footer><Btn icon="camera" label="Rozumiem, nagrywam" onPress={B.go} /></Footer>
    </View>
  );
}

const Step = ({ n, b, bg, fg, children }: any) => (
  <View style={{ flexDirection: 'row', gap: 14 }}>
    <View style={{ width: 30, height: 30, borderRadius: 30, borderWidth: 2, borderColor: col(b), backgroundColor: col(bg), alignItems: 'center', justifyContent: 'center' }}><Txt mono s={14} c={fg}>{n}</Txt></View>
    <View style={{ flex: 1, gap: 10 }}>{children}</View>
  </View>
);

export function Pack({ p }: any) {
  const K = p.K;
  return (
    <View style={{ flex: 1 }}>
      <Header title={K.title} onBack={p.back} />
      <Body gap={20}>
        <Txt s={15} c="var(--fg-2)" lh={1.45}>{K.intro}</Txt>
        <Step n="1" b={K.s1Border} bg={K.s1Bg} fg={K.s1Fg}>
          <Txt s={17} w={600}>{K.s1Title}</Txt>
          <Row gap={14}>
            <View style={{ width: 96, height: 96, borderRadius: 4, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Icon name="qr-code" size={64} color="#050507" /></View>
            <Txt s={14} c="var(--fg-2)" lh={1.4} style={{ flex: 1 }}>Jednorazowa karta z kodem. Włóż ją do środka paczki – kupujący zobaczy ją dopiero po otwarciu.</Txt>
          </Row>
          {K.s1Todo ? <Btn kind="outline" h={44} s={15} icon="printer" label="Drukuj kartę" onPress={K.print} style={{ alignSelf: 'flex-start' }} /> : <Txt s={15} w={500} c="var(--secured)">Karta wydrukowana</Txt>}
        </Step>
        <Step n="2" b={K.s2Border} bg={K.s2Bg} fg={K.s2Fg}>
          <Txt s={17} w={600}>{K.s2Title}</Txt>
          {K.s2Todo ? <Btn kind="outline" h={44} s={15} icon="camera" label="Nagraj pakowanie" onPress={K.rec} disabled={K.recOpacity < 1} style={{ alignSelf: 'flex-start' }} /> : <Txt s={15} w={500} c="var(--secured)">Nagranie gotowe · <Txt mono c="var(--secured)">{K.dur}</Txt></Txt>}
        </Step>
        <Step n="3" b={K.s3Border} bg={K.s3Bg} fg={K.s3Fg}>
          <Txt s={17} w={600}>Numer przesyłki</Txt>
          <Field mono value={K.tracking} onChangeText={(t: string) => K.setTracking(ev(t))} placeholder="np. 6200 4417 9032" keyboardType="number-pad" />
        </Step>
      </Body>
      <Footer center gap={10}>
        <Label>{K.deadline}</Label>
        <Btn label={K.cta} onPress={K.submit} disabled={K.cant} style={{ alignSelf: 'stretch' }} />
      </Footer>
    </View>
  );
}

const Pill = ({ children, bg = 'rgba(5,5,7,0.72)', style }: any) => <View style={[{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;

export function Camera({ p }: any) {
  const C = p.C;
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12' }}>
      {C.bg ? <><Image source={C.bg} resizeMode="cover" style={FILL} /><View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} /></> : null}
      {C.isRec ? <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.18)' }}><View style={{ height: 4, width: C.limitPct, backgroundColor: C.limitColor }} /></View> : null}
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={C.cancel} style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: 'rgba(5,5,7,0.72)', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={22} color="#FFFFFF" /></Pressable>
        {C.isRec ? <Pill><View style={{ width: 9, height: 9, borderRadius: 9, backgroundColor: '#FF6B6B' }} /><Txt mono s={15} c="#FFFFFF">{C.time} / 02:00</Txt></Pill> : null}
        <Pill style={{ paddingHorizontal: 12 }}><Txt mono s={12} w={600} up ls={0.7} c="#FFFFFF">{C.tag}</Txt></Pill>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <View style={{ width: 200, height: 200, borderWidth: 3, borderColor: C.frame, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
          {C.found ? <Icon name="qr-code" size={64} color="#14F195" /> : null}
        </View>
        {C.hasChecks ? (
          <View style={{ gap: 8, backgroundColor: 'rgba(5,5,7,0.72)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, minWidth: 260 }}>
            {C.checks.map((c: any) => <Row key={c.label}><Icon name="check" size={16} color={c.color} /><Txt s={15} c={c.color}>{c.label}</Txt></Row>)}
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center', gap: 16 }}>
        {C.found ? <Pill bg="#14F195" style={{ paddingVertical: 10, paddingHorizontal: 16 }}><Icon name="circle-check" size={18} color="#050507" /><Txt s={16} w={700} c="#050507">{C.status}</Txt></Pill>
          : <Pill style={{ paddingVertical: 10, paddingHorizontal: 16 }}><Txt s={16} w={600} c="#FFFFFF">{C.status}</Txt></Pill>}
        <Txt s={15} c="#DDDDDD" center lh={1.45} style={{ maxWidth: 300 }}>{C.hint}</Txt>
        {C.isRec ? (
          <Pressable onPress={C.stop} style={{ width: 78, height: 78, borderRadius: 78, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: C.opacity }}>
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#FF6B6B' }} />
          </Pressable>
        ) : null}
        {C.isScan ? <Btn kind="mint" w={700} label={C.scanCta} onPress={C.stop} disabled={C.opacity < 1} style={{ alignSelf: 'stretch' }} /> : null}
      </View>
    </View>
  );
}

export function Decide({ p }: any) {
  const X = p.X;
  return (
    <View style={{ flex: 1 }}>
      <Header title="Jak przesyłka?" />
      <Body gap={14}>
        <Photo h={170} label={'nagranie otwarcia · ' + X.dur} src={X.img} />
        <Row><Icon name="circle-check" size={18} color="var(--secured)" /><Txt s={15} c="var(--fg-2)">Kod z karty w paczce potwierdzony</Txt></Row>
        <Txt s={26} w={600} ls={-0.5} lh={1.1}>Zgadza się z opisem?</Txt>
        <Txt s={15} c="var(--fg-2)" lh={1.45}>Zdecyduj teraz. „Wszystko OK” przekazuje {X.priceText} SOL (≈ {X.zl}) sprzedającemu – tego nie da się cofnąć.</Txt>
        <View style={{ borderTopWidth: 1, borderTopColor: LINE, paddingTop: 14, gap: 10 }}>
          <Label>Jeśli reklamujesz – kategoria</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{X.cats.map((c: any) => <Chip key={c.label} c={c} h={40} bw={2} />)}</View>
          <TextInput value={X.text} onChangeText={t => X.setText(ev(t))} multiline numberOfLines={3} placeholder="Opisz problem, np. plama na przodzie, której nie ma w opisie" placeholderTextColor={PH}
            style={{ minHeight: 88, borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, color: col('var(--fg-1)'), fontFamily: F.sans[400], fontSize: 15, textAlignVertical: 'top' }} />
          <Txt s={13} c="var(--fg-3)" lh={1.45}>Przy reklamacji nagranie otwarcia trafi do oceny razem z nagraniem pakowania sprzedającego.</Txt>
        </View>
      </Body>
      <Footer>
        <Btn kind="mint" w={700} icon="check" label="Wszystko OK" onPress={X.accept} />
        <Btn kind="warn" w={700} label="Reklamuję" onPress={X.complain} disabled={X.cant} />
      </Footer>
    </View>
  );
}
