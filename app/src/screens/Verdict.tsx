import React from 'react';
import { View } from 'react-native';
import { Txt, Label, Btn, Notice, Header, Body, Footer, ExplorerLink, KV } from '../ui';
import { col, LINE, LINE_STRONG } from '../theme';

export function Verdict({ p }: any) {
  const V = p.V;
  return (
    <View style={{ flex: 1 }}>
      <Header title="Ocena reklamacji" onBack={p.back} right={<Label>reguły v1</Label>} />
      <Body>
        <Txt s={30} w={600} ls={-0.9} lh={1.05}>{V.title}</Txt>
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 2, borderColor: col(V.resultColor) }}>
          <Txt s={16} w={700} c={V.resultColor}>{V.result}</Txt>
        </View>
        {V.byEvidence ? <Notice tone="var(--line-strong)" icon="file-warning" iconColor="var(--fg-2)" title="Bez oceny nagrań" text={V.reasoning} /> : null}
        {V.hasChecks ? <View>
          <Label style={{ marginBottom: 2 }}>Sprawdzone warunki (w kolejności reguły)</Label>
          {V.checks.map((c: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: LINE }}>
              <View style={{ flex: 1 }}>
                <Txt s={15}>{c.label}</Txt>
                {c.hasDetail ? <Txt mono s={14} c="var(--warning)" style={{ marginTop: 3 }}>{c.detail}</Txt> : null}
              </View>
              <Txt mono s={14} w={600} c={c.color}>{c.answer}</Txt>
            </View>
          ))}
          <Txt s={17} w={700} c={V.resultColor} style={{ paddingVertical: 12 }}>→ {V.conclusion}</Txt>
        </View> : null}
        {!V.byEvidence ? <View style={{ gap: 6 }}>
          <Label>Opis nagrań przygotowany przez AI</Label>
          <Txt s={15} c="var(--fg-2)" lh={1.45}>{V.reasoning}</Txt>
        </View> : null}
        {V.reportShort ? <KV k="Raport zgodny z zapisem w umowie" v={V.reportShort} last /> : null}
        {V.reportHref ? <ExplorerLink href={V.reportHref} label="Pobierz raport (report.json)" /> : null}
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 8, overflow: 'hidden' }}>
          <View style={{ flex: 1, padding: 14, gap: 6, borderRightWidth: 1, borderRightColor: LINE_STRONG }}>
            <Label c="var(--secured)">Tutaj</Label>
            <Txt s={14} lh={1.45}>Jawne reguły, te same dla każdego. AI tylko opisuje nagrania, wynik liczy kod. Raport jest zapisany w umowie.</Txt>
          </View>
          <View style={{ flex: 1, padding: 14, gap: 6, backgroundColor: col('var(--surface-1)') }}>
            <Label>Support platformy</Label>
            <Txt s={14} c="var(--fg-2)" lh={1.45}>Reguły niejawne. Decyzja konsultanta, bez wglądu w uzasadnienie i bez możliwości sprawdzenia.</Txt>
          </View>
        </View>
        {V.hasNext ? <Notice bw={2} tone="var(--warning)" icon="package" title="Co dalej" text={V.next} /> : null}
      </Body>
      <Footer border gap={6}>
        {V.actReturn ? <Btn icon="package" label="Spakuj zwrot" onPress={V.returnFlow} /> : null}
        {V.href ? <ExplorerLink href={V.href} label="Zobacz w Solana Explorer" /> : null}
      </Footer>
    </View>
  );
}
