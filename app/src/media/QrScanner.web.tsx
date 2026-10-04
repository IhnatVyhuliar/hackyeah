// Browser-only stand-in for the card scanner: the test browser has no camera, so the card's text is pasted
// (the packing screen shows it under the QR in the browser). The contract still checks it against the commitment.
import React, { useState } from 'react';
import { View, TextInput } from 'react-native';
import { Txt, Btn } from '../ui';
import { col, F, PH, LINE_STRONG } from '../theme';

export function QrScanner({ prefix, onScan }: { prefix: string; onScan: (payload: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const ok = text.trim().startsWith(prefix);
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12', padding: 20, paddingTop: 72, gap: 12 }}>
      <Txt s={15} c="#DDDDDD" lh={1.45}>W przeglądarce testowej nie ma aparatu. Wklej treść karty (widać ją pod kodem na ekranie pakowania).</Txt>
      <TextInput value={text} onChangeText={setText} placeholder="UNBOX1:…" placeholderTextColor={PH} autoCapitalize="none" autoCorrect={false}
        accessibilityLabel="Treść karty"
        style={{ minHeight: 48, borderWidth: 1, borderColor: LINE_STRONG, borderRadius: 4, paddingHorizontal: 14, color: col('var(--fg-1)'), fontFamily: F.mono[400], fontSize: 14 }} />
      <Btn kind="mint" label="Użyj kodu" disabled={!ok} onPress={() => onScan(text.trim())} />
    </View>
  );
}
