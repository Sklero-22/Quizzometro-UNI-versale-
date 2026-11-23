import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { Btn, Card, H2, Label, Notice, P, Screen } from '../src/components/ui';
import { INSTALLED_VERSION, isNewer, parseRepo, UPDATE_ACTION_LABEL, UPDATE_NOTE } from '../src/data/releases';
import { useStore } from '../src/data/store';
import { useInstall } from '../src/data/useInstall';
import { colors, fonts, radius } from '../src/theme';
import { UpdateInstructionsModal } from '../src/components/UpdateInstructionsModal';

export default function Settings() {
  const router = useRouter();
  const { data, updateSettings, checkUpdates, checkingUpdates } = useStore();
  const { busy, install, instructionsVisible, confirmDownload, cancelDownload } = useInstall();
  const s = data.settings;
  const [repo, setRepo] = useState(s.repoUrl);
  const [repoError, setRepoError] = useState<string | null>(null);
  const rel = s.latestRelease;
  const newer = !!rel && isNewer(rel.tag);

  const save = (): boolean => {
    const v = repo.trim();
    if (!parseRepo(v)) {
      setRepoError('URL non valido: usa https://github.com/proprietario/repository');
      return false;
    }
    setRepoError(null);
    updateSettings({ repoUrl: v, latestRelease: v === s.repoUrl ? s.latestRelease : null, dismissedTag: null });
    return true;
  };

  const check = async () => {
    if (!save()) return;
    await checkUpdates(true);
  };

  return (
    <>
      <Screen title="Aggiornamenti app" onBack={() => router.back()}>
      <Card>
        <Label>Versione installata</Label>
        <H2>{INSTALLED_VERSION}</H2>
        <Label>Repository delle release</Label>
        <TextInput
          value={repo}
          onChangeText={setRepo}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{
            borderWidth: 1.5,
            borderColor: repoError ? colors.destructive : colors.input,
            borderRadius: radius.base,
            padding: 12,
            fontFamily: fonts.body,
            fontSize: 14.5,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        {repoError && <Notice tone="danger">{repoError}</Notice>}
        <Btn title="Salva" variant="ghost" onPress={save} />
        <Btn title="Controlla ora" icon="refresh-cw" onPress={check} loading={checkingUpdates} />
      </Card>

      <Card>
        <H2>Stato</H2>
        <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
          Ultimo controllo:{' '}
          {s.lastUpdateCheck ? new Date(s.lastUpdateCheck).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : 'mai'}
        </P>
        {s.updateError && <Notice tone="danger">{s.updateError}</Notice>}
        {!s.updateError && rel && !newer && <Notice tone="success">{`Hai già l’ultima versione (${rel.version}).`}</Notice>}
        {rel && newer && (
          <>
            <Notice tone="success">{`Disponibile: ${rel.name} (versione ${rel.version}).`}</Notice>
            <Btn
              title={UPDATE_ACTION_LABEL}
              icon="download"
              loading={busy}
              onPress={() => install(rel)}
            />
          </>
        )}
        <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
          {UPDATE_NOTE}
        </P>
      </Card>
      </Screen>
      <UpdateInstructionsModal
        visible={instructionsVisible}
        onConfirm={confirmDownload}
        onCancel={cancelDownload}
      />
    </>
  );
}
