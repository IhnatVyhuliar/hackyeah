import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarIconStyle: { display: 'none' }, tabBarLabelStyle: { fontSize: 13 } }}>
      <Tabs.Screen name="index" options={{ title: 'Przeglądaj' }} />
      <Tabs.Screen name="sell" options={{ title: 'Wystaw' }} />
      <Tabs.Screen name="sales" options={{ title: 'Sprzedaże' }} />
      <Tabs.Screen name="purchases" options={{ title: 'Zakupy' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Portfel' }} />
    </Tabs>
  );
}
