// The recording chrome shared by the phone and browser recorders: limit bar, timer, checklist, status, stop button.
import React from 'react';
import { View, Pressable } from 'react-native';
import { Txt, Icon, Row } from '../ui';
import { LIMIT_S, MIN_S, SHOW, clock, type RecMode } from './brief';

const Pill = ({ children, bg = 'rgba(5,5,7,0.72)', style }: any) => (
  <View style={[{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>
);

export function RecOverlay({ mode, el, recording, qrSeen, source, error, onStart, onStop, onCancel }: {
  mode: RecMode; el: number; recording: boolean; qrSeen: boolean; source?: string; error?: string | null;
  onStart: () => void; onStop: () => void; onCancel: () => void;
}) {
  const pct = `${Math.min(100, (el / LIMIT_S) * 100)}%` as const;
  const canStop = recording && el >= MIN_S;
  const status = error ? error : !recording ? (mode === 'unboxing' ? 'Zacznij od zamkniętej paczki' : 'Gotowe do nagrania')
    : qrSeen ? 'Kod z karty wykryty' : el < MIN_S ? 'Nagrywam…' : 'Nagrywam – pokaż wszystko z listy';
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' }} pointerEvents="box-none">
      <View>
        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.18)' }}><View style={{ height: 4, width: pct, backgroundColor: el > 100 ? '#FF6B6B' : '#fff' }} /></View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={onCancel} style={{ width: 44, height: 44, borderRadius: 44, backgroundColor: 'rgba(5,5,7,0.72)', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={22} color="#FFFFFF" /></Pressable>
          <Pill>{recording ? <View style={{ width: 9, height: 9, borderRadius: 9, backgroundColor: '#FF6B6B' }} /> : null}<Txt mono s={15} c="#FFFFFF">{clock(el)} / 02:00</Txt></Pill>
          <Pill style={{ paddingHorizontal: 12 }}><Txt mono s={12} w={600} up ls={0.7} c="#FFFFFF">{source ?? '720p'}</Txt></Pill>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center', gap: 14 }}>
        <View style={{ gap: 6, backgroundColor: 'rgba(5,5,7,0.72)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignSelf: 'stretch' }}>
          {SHOW[mode].map((t) => <Row key={t}><Icon name="check" size={14} color="rgba(255,255,255,.6)" /><Txt s={14} c="#DDDDDD">{t}</Txt></Row>)}
        </View>
        <Pill bg={qrSeen ? '#14F195' : error ? '#FF6B6B' : 'rgba(5,5,7,0.72)'} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
          <Txt s={16} w={700} c={qrSeen || error ? '#050507' : '#FFFFFF'}>{status}</Txt>
        </Pill>
        {recording ? (
          <Pressable accessibilityLabel="Zakończ nagrywanie" onPress={canStop ? onStop : undefined} style={{ width: 78, height: 78, borderRadius: 78, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: canStop ? 1 : 0.4 }}>
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: '#FF6B6B' }} />
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="Nagrywaj" onPress={error ? undefined : onStart} style={{ width: 78, height: 78, borderRadius: 78, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: error ? 0.4 : 1 }}>
            <View style={{ width: 56, height: 56, borderRadius: 56, backgroundColor: '#FF6B6B' }} />
          </Pressable>
        )}
      </View>
    </View>
  );
}
