import React from 'react';
import { View, Pressable } from 'react-native';
import { Txt, Label, Icon, Photo, Btn, Notice, Header, Body, Footer, Dot, ExplorerLink, Row, open } from '../ui';
import { col, LINE, LINE_STRONG } from '../theme';

const Slot = ({ k, children }: any) => <View style={{ gap: 3 }}><Label>{k}</Label>{children}</View>;

function Settle({ D }: any) {
  if (D.settleLocked) return (
    <View style={{ gap: 8, alignItems: 'center' }}>
      <View style={{ height: 56, alignSelf: 'stretch', borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', borderColor: LINE_STRONG, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="lock" size={18} color="var(--fg-3)" /><Txt s={17} w={600} c="var(--fg-3)">{D.settleLabel}</Txt>
      </View>
      <Txt s={14} c="var(--fg-2)" center>Odblokuje się po terminie. Nikt nie musi się zgodzić.</Txt>
    </View>
  );
  if (D.settleChecking) return (
    <View style={{ gap: 8, alignItems: 'center' }}>
      <View style={{ height: 56, alignSelf: 'stretch', borderRadius: 999, borderWidth: 2, borderColor: col('var(--warning)'), alignItems: 'center', justifyContent: 'center' }}>
        <Txt s={17} w={600} c="var(--warning)">Sprawdzam czas sieci…</Txt>
      </View>
      <Txt s={14} c="var(--fg-2)" center>Termin liczy sieć, nie zegar telefonu.</Txt>
    </View>
  );
  if (D.settleMine) return (
    <View style={{ gap: 8 }}>
      <Btn kind="mint" h={60} s={18} w={700} icon="lock-open" label={D.settleLabel} onPress={D.settle} />
      <Txt s={14} c="var(--fg-2)" center>Nikt nie musi się zgodzić. Umowa wykona się sama.</Txt>
    </View>
  );
  if (D.settleOther) return (
    <View style={{ gap: 8 }}>
      <Btn kind="strong" label={D.settleLabel} onPress={D.settle} />
      <Txt s={14} c="var(--fg-2)" center>Po terminie może to zrobić każdy. {D.outcome}</Txt>
    </View>
  );
  return null;
}

export function Deal({ p }: any) {
  const D = p.D;
  return (
    <View style={{ flex: 1 }}>
      <Header title="Transakcja" onBack={p.back} right={<Label>#{D.no}</Label>} />
      <Body>
        <Row gap={12}>
          <Photo h={64} w={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt s={16} w={500}>{D.title}</Txt>
            <Txt mono s={15} w={500}>{D.priceText} SOL <Txt mono s={13} c="var(--fg-3)">≈ {D.zl}</Txt></Txt>
            <Txt s={14} c="var(--fg-3)">{D.parties}</Txt>
          </View>
        </Row>
        <Row gap={6}><Dot c={D.statusColor} s={8} /><Txt mono s={13} w={600} up ls={0.5} c={D.statusColor}>{D.statusLabel}</Txt></Row>

        {p.lowBal ? (
          <Notice tone="var(--warning)" icon="droplet" title="Saldo 0 SOL – nic nie potwierdzisz" text="Każda operacja, także odbiór paczki, kosztuje ułamek grosza opłaty sieci.">
            <Btn kind="outline" h={48} s={16} icon="droplet" label="Doładuj testowe SOL" onPress={p.faucet} />
          </Notice>
        ) : null}
        {D.nSecured ? <Notice tone="var(--secured)" icon="circle-check" title={D.nTitle} text={D.nText} /> : null}
        {D.nNeutral ? <Notice tone="var(--line-strong)" icon="scan-line" iconColor="var(--fg-2)" title={D.nTitle} text={D.nText} /> : null}

        {D.isActive ? (
          <View style={{ borderWidth: 2, borderColor: col(D.cardBorder), borderRadius: 8, padding: 16, gap: 14 }}>
            <Txt mono s={13} w={600} up ls={0.8}>Co teraz?</Txt>
            <Slot k="Gdzie są pieniądze"><Txt s={16} w={500} c={D.fundsColor}>{D.funds}</Txt></Slot>
            <Slot k="Kto ma ruch"><Txt s={16}>{D.who}</Txt></Slot>
            {D.hasDeadline ? (
              <Slot k="Do kiedy">
                <Txt mono s={32} w={500} c={D.cdColor} style={{ fontVariant: ['tabular-nums'] }}>{D.countdown}</Txt>
                <Txt s={14} c="var(--fg-3)">{D.cdWhen}</Txt>
              </Slot>
            ) : null}
            <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE, gap: 3 }}>
              <Label>Jeśli nikt nic nie zrobi</Label>
              <Txt s={17} w={600} lh={1.35}>{D.after}</Txt>
            </View>
            <Settle D={D} />
          </View>
        ) : null}

        <View>
          <Label style={{ marginBottom: 12 }}>Stany umowy</Label>
          {D.timeline.map((t: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 14, height: 14, borderRadius: 14, marginTop: 4, borderWidth: 2, borderColor: col(t.color), backgroundColor: col(t.fill) }} />
                {t.notLast ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: col(t.line) }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 14, gap: 3 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Txt s={16} w={t.weight} c={t.labelColor}>{t.label}</Txt>
                  {t.showId ? <Txt mono s={11} c="var(--fg-3)">{t.id}</Txt> : null}
                </View>
                {t.hasSub ? <Txt s={14} c="var(--fg-2)">{t.sub}</Txt> : null}
                <Row gap={12}>
                  <Txt mono s={12} up ls={0.5} c="var(--fg-3)">{t.when}</Txt>
                  {t.hasSig ? <Pressable onPress={() => open(t.href)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt s={13} c="var(--fg-2)" style={{ textDecorationLine: 'underline' }}>Explorer</Txt><Icon name="external-link" size={12} color="var(--fg-2)" /></Pressable> : null}
                </Row>
                {t.hasAlt ? <Txt s={13} c="var(--fg-3)" lh={1.4}>↳ {t.alt}</Txt> : null}
              </View>
            </View>
          ))}
        </View>

        <View>
          <Label style={{ marginBottom: 4 }}>Zapisane w umowie</Label>
          {D.evidence.map((e: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: LINE }}>
              <Txt s={15} c="var(--fg-2)" style={{ flex: 1 }}>{e.label}</Txt><Txt mono s={13} c="var(--fg-3)">{e.value}</Txt>
            </View>
          ))}
          <Txt s={13} c="var(--fg-3)" lh={1.45} style={{ marginTop: 8 }}>Odciski plików i terminy są zapisane w sieci i nie da się ich zmienić. Same pliki leżą w zewnętrznym magazynie – odcisk pokazuje, czy ktoś je podmienił.</Txt>
        </View>
      </Body>
      <Footer border gap={6}>
        {D.actRecord ? <Btn icon="camera" label="Nagraj otwarcie" onPress={D.record} /> : null}
        {D.actShip ? <Btn icon="package" label="Spakuj i nadaj" onPress={D.shipFlow} /> : null}
        {D.actReturn ? <Btn icon="package" label="Spakuj zwrot" onPress={D.returnFlow} /> : null}
        {D.actScan ? <Btn icon="scan-line" label="Zeskanuj kod zwrotu" onPress={D.scan} /> : null}
        {D.hasVerdict ? <Btn kind="secondary" label="Zobacz ocenę AI" onPress={D.verdict} /> : null}
        {D.actCancel ? <Btn kind="outline" label="Anuluj ogłoszenie" onPress={D.cancel} /> : null}
        <ExplorerLink href={D.href} />
      </Footer>
    </View>
  );
}
