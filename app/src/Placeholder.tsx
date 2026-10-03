// Tymczasowy ekran dla tras innych osób (O2/O3). Właściciel zastępuje cały plik trasy.
import { Text, View } from 'react-native';
import { s } from './ui';

export function Placeholder({ title, owner, hint }: { title: string; owner: string; hint: string }) {
  return (
    <View style={s.center}>
      <Text style={s.h2}>{title}</Text>
      <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>Ekran w przygotowaniu ({owner}).</Text>
      <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{hint}</Text>
    </View>
  );
}
