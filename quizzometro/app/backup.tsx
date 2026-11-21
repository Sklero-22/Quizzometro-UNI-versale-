import * as DocumentPicker from 'expo-document-picker';
import { readPickedText, shareTextFile } from '../src/platform/files';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Btn, Card, H2, Label, Notice, P, Screen } from '../src/components/ui';
import { backupFileName, serializeBackup, validateBackup, type BackupSummary } from '../src/data/backup';
import {
  backupDirectoryLabel,
  chooseBackupDirectory,
  getSavedBackupDirectory,
  listLocalBackups,
  readLocalBackup,
  saveLocalBackup,
  type LocalBackupFile,
} from '../src/data/localBackup';
import { isPristineInstall, type RestoreMode } from '../src/data/restore';
import { useStore } from '../src/data/store';
import { colors } from '../src/theme';

const fmtDate = (t: number | null) =>
  t === null ? 'nessuna' : new Date(t).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

export default function Backup() {
  const router = useRouter();
  const { data, restoreBackup } = useStore();
  const [busy, setBusy] = useState<'export' | 'local' | 'folder' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderUri, setFolderUri] = useState<string | null>(null);
  const [localBackups, setLocalBackups] = useState<LocalBackupFile[]>([]);
  const [loadingBackupUri, setLoadingBackupUri] = useState<string | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode | null>(null);
  const pristine = isPristineInstall(data);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await getSavedBackupDirectory();
        if (cancelled) return;
        setFolderUri(saved);
        if (saved) setLocalBackups(await listLocalBackups(saved));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLocalBackups = async (directoryUri = folderUri) => {
    if (!directoryUri) {
      setLocalBackups([]);
      return;
    }
    setLocalBackups(await listLocalBackups(directoryUri));
  };

  const chooseFolder = async () => {
    setError(null);
    setBusy('folder');
    try {
      const selected = await chooseBackupDirectory(folderUri);
      if (!selected) return;
      const changed = folderUri !== null;
      setFolderUri(selected);
      setLocalBackups([]);
      await refreshLocalBackups(selected);
      Alert.alert(
        'Cartella salvata',
        changed
          ? 'Questa cartella verrà riutilizzata. I file nella cartella precedente restano lì.'
          : 'Questa cartella verrà riutilizzata per i prossimi backup.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setError(null);
    setBusy('export');
    try {
      await shareTextFile(backupFileName(), serializeBackup(data), 'Salva il backup di Quizzometro');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doLocalExport = async () => {
    setError(null);
    setBusy('local');
    try {
      let destination = folderUri;
      if (!destination) {
        destination = await chooseBackupDirectory();
        if (!destination) return;
        setFolderUri(destination);
      }
      const saved = await saveLocalBackup(destination, data);
      await refreshLocalBackups(destination);
      Alert.alert('Backup salvato', `${saved.name}\nCartella: ${backupDirectoryLabel(destination)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const loadBackup = (text: string, name: string) => {
    const next = validateBackup(text);
    setSummary(next);
    setSelectedName(name);
    setRestoreMode(pristine ? 'replace_all' : null);
  };

  const pick = async () => {
    setError(null);
    setSummary(null);
    setBusy('import');
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const text = await readPickedText(res.assets[0]);
      loadBackup(text, res.assets[0].name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const pickLocal = async (backup: LocalBackupFile) => {
    setError(null);
    setBusy('import');
    setLoadingBackupUri(backup.uri);
    try {
      loadBackup(await readLocalBackup(backup.uri), backup.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setLoadingBackupUri(null);
    }
  };

  const confirmRestore = () => {
    if (!summary || !restoreMode) return;
    const mode = restoreMode;
    const modeDescriptions: Record<RestoreMode, string> = {
      replace_all: 'Il backup sostituirà materie, domande, sessioni, statistiche e impostazioni attuali.',
      merge_overwrite: 'Gli elementi mancanti verranno aggiunti; quelli coincidenti saranno aggiornati dal backup.',
      overwrite_common_only: 'Saranno aggiornati solo gli elementi già presenti; gli elementi esclusivi del backup non verranno importati.',
    };
    Alert.alert(
      mode === 'replace_all' ? 'Sostituire tutti i dati?' : 'Confermare il ripristino selettivo?',
      modeDescriptions[mode],
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: mode === 'replace_all' ? 'Sostituisci tutto' : 'Ripristina',
          style: mode === 'replace_all' ? 'destructive' : 'default',
          onPress: () => {
            restoreBackup(summary.data, mode);
            setSummary(null);
            setSelectedName(null);
            setRestoreMode(null);
            Alert.alert('Ripristino completato', 'I dati del backup sono ora attivi.');
          },
        },
      ],
    );
  };

  return (
    <Screen title="Backup" onBack={() => router.back()}>
      <Card>
        <H2>Backup nella cartella scelta</H2>
        <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
          Salva materie, domande, progressi, sessioni e impostazioni in un file locale. Android ricorderà la cartella
          scelta anche alle aperture successive.
        </P>
        <P color={colors.mutedForeground} style={{ fontSize: 12.5 }}>
          Scegli la memoria interna o una scheda SD. Il file JSON non è cifrato.
        </P>
        <P style={{ fontSize: 14 }}>
          Ora: {data.subjects.length} materie, {data.subjects.reduce((n, s) => n + s.questions.length, 0)} domande,{' '}
          {data.sessions.length} sessioni.
        </P>
        {Platform.OS !== 'web' && (
          <>
        {folderUri ? (
          <Notice tone="success">Cartella: {backupDirectoryLabel(folderUri)}</Notice>
        ) : (
          <Notice>La prima volta scegli una cartella. Potrai cambiarla quando vuoi.</Notice>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn
            title={folderUri ? 'Cambia cartella' : 'Scegli cartella'}
            variant="ghost"
            icon="folder"
            onPress={chooseFolder}
            loading={busy === 'folder'}
            disabled={busy !== null && busy !== 'folder'}
          />
          <Btn
            title="Crea backup locale"
            icon="save"
            onPress={doLocalExport}
            loading={busy === 'local'}
            disabled={busy !== null && busy !== 'local'}
          />
        </View>
        {folderUri && (
          <>
            <Btn
              title="Aggiorna elenco backup"
              variant="ghost"
              small
              icon="refresh-cw"
              onPress={() => void refreshLocalBackups().catch((e) => setError(e instanceof Error ? e.message : String(e)))}
              disabled={busy !== null}
            />
            {localBackups.length === 0 ? (
              <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                Nessun backup Quizzometro trovato in questa cartella.
              </P>
            ) : (
              <View style={{ gap: 8 }}>
                <Label>Backup trovati</Label>
                {localBackups.map((backup) => (
                  <View key={backup.uri} style={{ gap: 4 }}>
                    <P numberOfLines={1} style={{ fontSize: 13 }}>
                      {backup.name}
                    </P>
                    <Btn
                      title="Controlla questo backup"
                      small
                      variant="ghost"
                      icon="search"
                      onPress={() => void pickLocal(backup)}
                      loading={busy === 'import' && loadingBackupUri === backup.uri}
                      disabled={busy !== null}
                    />
                  </View>
                ))}
              </View>
            )}
          </>
        )}
          </>
        )}
        <Btn
          title={Platform.OS === 'web' ? 'Salva una copia JSON' : 'Condividi una copia JSON'}
          variant="ghost"
          icon="share-2"
          onPress={doExport}
          loading={busy === 'export'}
          disabled={busy !== null && busy !== 'export'}
        />
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <Card>
        <H2>Ripristina</H2>
        <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
          Puoi scegliere un backup salvato nella cartella oppure un file JSON dal dispositivo.
        </P>
        <Btn
          title="Scegli un file di backup"
          variant="ink"
          icon="upload"
          onPress={pick}
          loading={busy === 'import' && loadingBackupUri === null}
          disabled={busy !== null}
        />
        {summary && (
          <View style={{ gap: 10 }}>
            <Label>Contenuto del backup</Label>
            {selectedName && <P numberOfLines={2} style={{ fontSize: 13 }}>{selectedName}</P>}
            <P style={{ fontSize: 14.5 }}>
              {summary.subjects} materie · {summary.questions} domande · {summary.sessions} sessioni
            </P>
            <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
              Esportato: {fmtDate(summary.exportedAt)}
            </P>
            <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
              Ultima attività: {fmtDate(summary.lastActivity)}
            </P>
            {pristine && (
              <Notice tone="success">
                Installazione pulita rilevata: il ripristino sarà completo, come richiesto.
              </Notice>
            )}
            <Label>Modalità di ripristino</Label>
            <P color={colors.mutedForeground} style={{ fontSize: 12.5, lineHeight: 17 }}>
              Le impostazioni dell’app vengono riprese dal backup; statistiche e sessioni seguono la modalità scelta.
            </P>
            <View style={{ gap: 10 }}>
              {(
                [
                  {
                    value: 'replace_all',
                    title: 'Sostituisci tutto',
                    description: 'Rimpiazza l’intero archivio attuale con quello del backup.',
                  },
                  {
                    value: 'merge_overwrite',
                    title: 'Unisci e aggiorna corrispondenti',
                    description: 'Aggiunge ciò che manca e aggiorna dal backup gli elementi coincidenti.',
                  },
                  {
                    value: 'overwrite_common_only',
                    title: 'Aggiorna solo corrispondenti',
                    description: 'Aggiorna solo gli elementi già presenti; non importa quelli esclusivi del backup.',
                  },
                ] as { value: RestoreMode; title: string; description: string }[]
              ).map((option) => (
                <View key={option.value} style={{ gap: 4 }}>
                  <Btn
                    title={option.title}
                    small
                    icon={restoreMode === option.value ? 'check-circle' : 'circle'}
                    variant={restoreMode === option.value ? 'ink' : 'ghost'}
                    onPress={() => setRestoreMode(option.value)}
                    disabled={pristine && option.value !== 'replace_all'}
                  />
                  <P color={colors.mutedForeground} style={{ fontSize: 12.5, lineHeight: 17 }}>
                    {option.description}
                  </P>
                </View>
              ))}
            </View>
            <Btn
              title={restoreMode === 'replace_all' ? 'Ripristina tutto' : 'Ripristina modalità selezionata'}
              variant={restoreMode === 'replace_all' ? 'danger' : 'ink'}
              icon="refresh-cw"
              onPress={confirmRestore}
              disabled={!restoreMode || busy !== null}
            />
            <Btn
              title="Annulla"
              variant="ghost"
              small
              onPress={() => {
                setSummary(null);
                setSelectedName(null);
                setRestoreMode(null);
              }}
            />
          </View>
        )}
      </Card>
    </Screen>
  );
}
