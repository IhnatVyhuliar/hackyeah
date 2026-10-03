import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider, useSession } from '../src/session';
import { Loading } from '../src/ui';

function Gate() {
  const { user, restoring } = useSession();
  const segments = useSegments();
  if (restoring) return <Loading />;
  const onLogin = segments[0] === 'login';
  if (!user && !onLogin) return <Redirect href="/login" />;
  if (user && onLogin) return <Redirect href="/wallet" />;
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="deal/[deal]" options={{ title: 'Szczegóły transakcji' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Gate />
    </SessionProvider>
  );
}
