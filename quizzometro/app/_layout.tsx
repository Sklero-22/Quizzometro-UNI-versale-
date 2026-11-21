import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { useFonts } from 'expo-font';
import * as DocumentPicker from 'expo-document-picker';
import { installWebAlert } from '../src/platform/alert';
import { readPickedText } from '../src/platform/files';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Btn, Card, ErrorBoundary, H2, P, Screen } from '../src/components/ui';
import { validateBackup } from '../src/data/backup';
import { INSTALLED_VERSION } from '../src/data/releases';
import { StoreProvider, useStore } from '../src/data/store';
import { colors, fonts } from '../src/theme';

installWebAlert();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function LoadError() {
  const { loadError, restoreBackup, resetEverything } = useStore();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const text = await readPickedText(res.assets[0]);
      restoreBackup(validateBackup(text).data);
    } catch (e) {
      Alert.alert('Ripristino non riuscito', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = () =>
    Alert.alert(
      'Ricominciare da zero?',
      'I dati locali illeggibili verranno sostituiti dalle materie incluse nell’app. I progressi attuali andranno persi.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Sostituisci', style: 'destructive', onPress: resetEverything },
      ],
    );
  return (
    <Screen title="Archivio non leggibile" scroll>
      <Card tone="danger">
        <H2>I dati salvati non si possono leggere</H2>
        <P>{loadError}</P>
        <P>I dati non sono stati toccati. Puoi ripristinare un backup oppure ricominciare da zero.</P>
      </Card>
      <Btn title="Ripristina da backup" icon="upload" onPress={restore} loading={busy} />
      <Btn title="Ricomincia da zero" variant="danger" icon="trash-2" onPress={reset} />
    </Screen>
  );
}

function Gate() {
  const { status } = useStore();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const [introElapsed, setIntroElapsed] = useState(false);
  const [entered, setEntered] = useState(false);
  const ready = (fontsLoaded || fontError !== null) && status !== 'loading';
  useEffect(() => {
    if ((fontsLoaded || fontError !== null) && status !== 'loading') {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError, status]);
  useEffect(() => {
    if (!ready || status !== 'ready') return;
    const timer = setTimeout(() => setIntroElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, [ready, status]);
  if (!ready) return null;
  if (status === 'error') return <LoadError />;
  if (!entered) {
    return (
      <Screen scroll={false} maxWidth={560}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', paddingBottom: 34 }}>
          <View
            style={{
              width: '100%',
              maxWidth: 360,
              aspectRatio: 1,
              borderRadius: 32,
              overflow: 'hidden',
              backgroundColor: colors.background,
            }}
          >
            <Image
              source={require('../assets/splash.png')}
              contentFit="cover"
              accessibilityLabel="Illustrazione iniziale Quizzometro"
              style={{ width: '100%', height: '100%', borderRadius: 32 }}
            />
          </View>
          <View style={{ height: 54, justifyContent: 'center', width: '100%', alignItems: 'center' }}>
            {introElapsed ? (
              <Btn
                title="Entra"
                icon="arrow-right"
                onPress={() => setEntered(true)}
                testID="intro-enter"
                style={{ width: 220 }}
              />
            ) : null}
          </View>
          <Text
            style={{
              position: 'absolute',
              right: 0,
              bottom: 4,
              color: colors.mutedForeground,
              fontFamily: fonts.bodyMedium,
              fontSize: 12,
            }}
            testID="intro-version"
          >
            v{INSTALLED_VERSION}
          </Text>
        </View>
      </Screen>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}>
      <Stack.Screen name="quiz" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaProvider>
          <StoreProvider>
            <Gate />
          </StoreProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
