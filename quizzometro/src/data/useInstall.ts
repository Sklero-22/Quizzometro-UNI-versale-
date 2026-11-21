import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import type { ReleaseInfo } from '../domain/types';
import { downloadAndInstall } from './releases';

export function useInstall() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const install = useCallback(async (release: ReleaseInfo) => {
    setBusy(true);
    setProgress(0);
    try {
      await downloadAndInstall(release, setProgress);
    } catch (e) {
      Alert.alert('Aggiornamento non riuscito', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, progress, install };
}
