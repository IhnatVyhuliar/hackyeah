// Polish camera permission prompt for the recorder, the scanner and the photo screen.
import React from 'react';
import { View } from 'react-native';
import { Txt, Btn } from '../ui';

export function Permission({ ask, onCancel, mic }: { ask: () => void; onCancel: () => void; mic?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#0E0E12', padding: 24, justifyContent: 'center', gap: 16 }}>
      <Txt s={24} w={600}>Potrzebujemy aparatu</Txt>
      <Txt s={15} c="var(--fg-2)" lh={1.45}>
        {mic ? 'Nagranie powstaje tylko w aplikacji, bez wyboru z galerii. Android wymaga też zgody na mikrofon, choć nagrywamy bez dźwięku.'
          : 'Aparat odczytuje kod z karty albo robi zdjęcie ubrania.'}
      </Txt>
      <Btn label="Zezwól" onPress={ask} />
      <Btn kind="ghost" label="Wróć" onPress={onCancel} />
    </View>
  );
}
