import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { API_URL, userMessage } from '../src/api';
import { useSession } from '../src/session';
import { Button, ErrorText, s } from '../src/ui';

const DEMO = [
  { label: 'Ania (sprzedająca)', email: 'ania@demo.pl' },
  { label: 'Bartek (kupujący)', email: 'bartek@demo.pl' },
];

export default function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e = email, p = password) {
    setBusy(true); setError(null);
    try { await login(e.trim(), p); } catch (err) { setError(userMessage(err)); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.content, { flex: 1, justifyContent: 'center' }]}>
        <Text style={s.h1}>Zaloguj się</Text>
        <TextInput style={s.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address"
          value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Hasło" secureTextEntry value={password} onChangeText={setPassword} />
        <ErrorText message={error} />
        <Button title={busy ? 'Logowanie…' : 'Zaloguj'} onPress={() => submit()} disabled={busy || !email || !password} />
        <Text style={[s.muted, { marginTop: 16 }]}>Konta demo (hasło demo1234):</Text>
        {DEMO.map((d) => (
          <Button key={d.email} kind="secondary" title={d.label} disabled={busy} onPress={() => submit(d.email, 'demo1234')} />
        ))}
        <Text style={[s.muted, { marginTop: 16 }]}>Serwer: {API_URL}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
