import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: '#0A0A0A' },
      headerTintColor: '#FFF',
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: '#0A0A0A' },
    }} />
  );
}
