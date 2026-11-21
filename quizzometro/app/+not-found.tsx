import { useRouter } from 'expo-router';
import React from 'react';
import { Btn, Empty, Screen } from '../src/components/ui';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen title="Pagina non trovata">
      <Empty title="Questa schermata non esiste" text="Torna alla Home per continuare a studiare." />
      <Btn title="Torna alla Home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
