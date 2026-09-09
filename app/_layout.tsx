import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Amiri_400Regular,
    Amiri_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.parchment },
          headerTintColor: Colors.bronze,
          headerTitleStyle: { fontFamily: 'Amiri_400Regular', fontSize: 18 },
          contentStyle: { backgroundColor: Colors.parchment },
        }}
      />
    </SafeAreaProvider>
  );
}
