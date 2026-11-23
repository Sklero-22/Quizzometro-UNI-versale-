import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { ReleaseInfo } from '../domain/types';
import { downloadAndInstall } from './releases';

export function useInstall() {
  const [busy, setBusy] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(false);
  const [pendingRelease, setPendingRelease] = useState<ReleaseInfo | null>(null);

  const openDownload = useCallback(async (release: ReleaseInfo) => {
    setBusy(true);
    try {
      await downloadAndInstall(release);
    } catch (e) {
      Alert.alert('Aggiornamento non riuscito', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(
    (release: ReleaseInfo) => {
      if (Platform.OS === 'android') {
        setPendingRelease(release);
        setInstructionsVisible(true);
        return;
      }
      void openDownload(release);
    },
    [openDownload],
  );

  const confirmDownload = useCallback(() => {
    const release = pendingRelease;
    setInstructionsVisible(false);
    setPendingRelease(null);
    if (release) void openDownload(release);
  }, [openDownload, pendingRelease]);

  const cancelDownload = useCallback(() => {
    setInstructionsVisible(false);
    setPendingRelease(null);
  }, []);

  return { busy, install, instructionsVisible, confirmDownload, cancelDownload };
}
