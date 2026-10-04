import React from 'react';
import { View, TextInput } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Txt, Label, Icon, Photo, Btn, Notice, Header, Body, Footer, Chip, Field, Row, ev } from '../ui';
import { col, F, PH, LINE, LINE_STRONG } from '../theme';
import { Recorder } from '../media/Recorder';
import { QrScanner } from '../media/QrScanner';
import { PhotoCapture } from '../media/PhotoCapture';

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
            <View style={{ width: 112, height: 112, borderRadius: 4, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              {K.hasCard ? <QRCode value={K.cardPayload} size={100} /> : <Icon name="qr-code" size={64} color="#9A9AA6" />}
            </View>
            <Txt s={14} c="var(--fg-2)" lh={1.4} style={{ flex: 1 }}>Jednorazowa karta z kodem. Włóż ją do środka paczki – kupujący zobaczy ją dopiero po otwarciu.</Txt>
          </Row>
          {K.cardError ? <Txt s={14} w={500} c="var(--danger)">{K.cardError}</Txt> : null}
          {K.showCardText ? (
            <View style={{ gap: 4 }}>
              <Label>Treść karty – tylko w przeglądarce testowej</Label>
              <Txt mono s={12} c="var(--fg-2)" selectable testID="card-payload">{K.cardPayload}</Txt>
            </View>
          ) : null}
          {K.s1Todo ? (
            <Row gap={8}>
              <Btn kind="outline" h={44} s={15} icon="printer" label="Drukuj kartę" onPress={K.print} disabled={!K.hasCard} />
              <Btn kind="ghost" h={44} s={15} label="Karta gotowa" onPress={K.markPrinted} disabled={!K.hasCard} />
            </Row>
          ) : <Txt s={15} w={500} c="var(--secured)">Karta gotowa</Txt>}
        </Step>
        <Step n="2" b={K.s2Border} bg={K.s2Bg} fg={K.s2Fg}>
          <Txt s={17} w={600}>{K.s2Title}</Txt>
          {K.s2Todo ? <Btn kind="outline" h={44} s={15} icon="camera" label="Nagraj pakowanie" onPress={K.rec} disabled={K.recOpacity < 1} style={{ alignSelf: 'flex-start' }} /> : <Txt s={15} w={500} c="var(--secured)">Nagranie gotowe · <Txt mono c="var(--secured)">{K.dur}</Txt></Txt>}
        </Step>
        <Step n="3" b={K.s3Border} bg={K.s3Bg} fg={K.s3Fg}>
          <Txt s={17} w={600}>Numer przesyłki</Txt>
          <Field mono value={K.tracking} onChangeText={(t: string) => K.setTracking(ev(t))} placeholder="np. 6200 4417 9032" />
        </Step>
      </Body>
      <Footer center gap={10}>
        <Label>{K.deadline}</Label>
        <Btn label={K.cta} onPress={K.submit} disabled={K.cant} style={{ alignSelf: 'stretch' }} />
      </Footer>
    </View>
  );
}

export function RecordScreen({ p }: any) {
  const R = p.R;
  return <Recorder mode={R.mode} onDone={R.done} onCancel={R.cancel} />;
}

export function ScanScreen({ p }: any) {
  const Q = p.Q;
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12' }}>
      <QrScanner prefix={Q.prefix} onScan={Q.done} onCancel={Q.cancel} />
      <View style={{ position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }} pointerEvents="box-none">
        <Btn kind="secondary" h={40} s={14} icon="x" label="Wróć" onPress={Q.cancel} />
        <Txt s={14} c="#DDDDDD" lh={1.4} style={{ flex: 1 }}>{Q.hint}</Txt>
      </View>
    </View>
  );
}

export function PhotoScreen({ p }: any) {
  return <PhotoCapture onPhoto={p.PH.done} onCancel={p.PH.cancel} />;
}

export function Decide({ p }: any) {
  const X = p.X;
  return (
    <View style={{ flex: 1 }}>
      <Header title="Jak przesyłka?" />
      <Body gap={14}>
        <Photo h={120} label={'nagranie otwarcia · ' + X.dur} />
        {X.hasQr ? <Row><Icon name="circle-check" size={18} color="var(--secured)" /><Txt s={15} c="var(--fg-2)">Kod z karty odczytany – sprawdzi go umowa</Txt></Row> : null}
        <Txt s={26} w={600} ls={-0.5} lh={1.1}>Zgadza się z opisem?</Txt>
        <Txt s={15} c="var(--fg-2)" lh={1.45}>Zdecyduj teraz. „Wszystko OK” przekazuje {X.priceText}{X.zl ? ' (≈ ' + X.zl + ')' : ''} sprzedającemu – tego nie da się cofnąć.</Txt>
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
