import * as DocumentPicker from 'expo-document-picker';
import { readPickedText, shareTextFile } from '../src/platform/files';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Platform, Switch, Text, TextInput, View } from 'react-native';
import { Btn, Card, Chip, H2, Label, Notice, P, Screen } from '../src/components/ui';
import { useStore } from '../src/data/store';
import { planImport } from '../src/domain/import/merge';
import { parseSubjectText, type DefaultOrigin, type ParsedSubject } from '../src/domain/import/parse';
import { createSubjectShareExport } from '../src/domain/import/subjectShare';
import type { Subject } from '../src/domain/types';
import { colors, fonts, radius } from '../src/theme';

const MAX_BYTES = 12 * 1024 * 1024;
const CLAUDE_APP_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

interface Loaded {
  text: string;
  fileName: string;
  sourceUrl?: string;
}

const CLAUDE_ARTIFACT_RE = /^https:\/\/claude\.ai\/artifact\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/i;

async function fetchClaudeArtifactHtml(artifactUrl: string): Promise<string> {
  const referer = artifactUrl.split('#')[0];
  const pageResponse = await fetch(referer, {
    headers: { Accept: 'text/html', 'User-Agent': CLAUDE_APP_USER_AGENT },
  });
  if (!pageResponse.ok) {
    throw new Error(`Claude ha risposto con errore ${pageResponse.status} aprendo l’Artifact.`);
  }
  const page = await pageResponse.text();
  if (page.length > MAX_BYTES) throw new Error('La pagina dell’Artifact supera il limite di 12 MB.');

  const uuid = /\bdata-frame-uuid=["']([0-9a-f-]{36})["']/i.exec(page)?.[1];
  if (!uuid) throw new Error('Non riesco a identificare l’Artifact nel link Claude.');

  const metadataUrl = `https://claude.ai/api/frame/${uuid}?via=user_open&bk=initial&actor=id&vt=1&rw=1`;
  const metadataResponse = await fetch(metadataUrl, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://claude.ai',
      Referer: referer,
      'User-Agent': CLAUDE_APP_USER_AGENT,
      'X-Frame-CP': 'go',
      'X-Frame-Platform': 'android',
      'X-Frame-Surface': 'standalone',
      'X-Frame-Session-Id': `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  if (!metadataResponse.ok) {
    throw new Error(
      metadataResponse.status === 403 || metadataResponse.status === 404
        ? 'Claude non consente di leggere questo Artifact. Verifica che il link sia pubblico.'
        : `Claude ha risposto con errore ${metadataResponse.status} recuperando i dati dell’Artifact.`,
    );
  }

  const metadata = (await metadataResponse.json()) as { kind?: string; ver?: string };
  if (metadata.kind !== 'public') {
    throw new Error('Questo Artifact Claude non è pubblico o richiede un accesso personale.');
  }
  if (!metadata.ver || !/^[A-Za-z0-9._-]{1,64}$/.test(metadata.ver)) {
    throw new Error('Claude ha restituito una versione dell’Artifact non valida.');
  }

  const frameUrl = `https://${uuid}.frame.claudeusercontent.com/_f/${metadata.ver}/`;
  const frameResponse = await fetch(frameUrl, {
    headers: { Accept: 'text/html', Referer: referer, 'User-Agent': CLAUDE_APP_USER_AGENT },
  });
  if (!frameResponse.ok) {
    throw new Error(`Non riesco a scaricare il contenuto dell’Artifact (errore ${frameResponse.status}).`);
  }
  const html = await frameResponse.text();
  if (html.length > MAX_BYTES) throw new Error('Il contenuto dell’Artifact supera il limite di 12 MB.');
  return html;
}

export default function Subjects() {
  const router = useRouter();
  const { data, setActiveSubject, deleteSubject, applyImportPlan } = useStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [busySubjectId, setBusySubjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharingSubjectId, setSharingSubjectId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [defaultOrigin, setDefaultOrigin] = useState<DefaultOrigin>('auto');
  const [target, setTarget] = useState<string>('auto');
  const [approve, setApprove] = useState(false);

  let parsed: ParsedSubject | null = null;
  let parseError: string | null = null;
  if (loaded) {
    try {
      parsed = parseSubjectText(loaded.text, loaded.fileName, defaultOrigin);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  const targetSubject = useMemo(() => {
    if (!parsed) return undefined;
    if (target === 'new') return undefined;
    if (target !== 'auto') return data.subjects.find((s) => s.id === target);
    const key = parsed.subjectKey;
    const byKey = key ? data.subjects.find((s) => s.subjectKey === key) : undefined;
    const sourceUrl = loaded?.sourceUrl ?? parsed.sourceUrl;
    const bySource = sourceUrl ? data.subjects.find((s) => s.sourceUrl === sourceUrl) : undefined;
    return (
      byKey ??
      bySource ??
      data.subjects.find(
        (s) => !(key && s.subjectKey) && s.title.trim().toLowerCase() === parsed!.title.trim().toLowerCase(),
      )
    );
  }, [parsed, target, data.subjects, loaded?.sourceUrl]);

  const plan = useMemo(() => (parsed ? planImport(targetSubject, parsed) : null), [parsed, targetSubject]);

  const pickFile = async (subjectId?: string) => {
    setError(null);
    setBusy(true);
    setBusySubjectId(subjectId ?? null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/html', 'text/*', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      const ext = (a.name.split('.').pop() ?? '').toLowerCase();
      if (!['json', 'html', 'htm'].includes(ext)) {
        throw new Error('Seleziona un file .json, .html o .htm.');
      }
      if (a.size && a.size > MAX_BYTES) throw new Error('Il file supera il limite di 12 MB.');
      const text = await readPickedText(a);
      if (text.length > MAX_BYTES) throw new Error('Il file supera il limite di 12 MB.');
      setLoaded({ text, fileName: a.name });
      setTarget(subjectId ?? 'auto');
      setApprove(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setBusySubjectId(null);
    }
  };

  const fetchUrl = async (source = url, subjectId?: string) => {
    setError(null);
    const u = source.trim();
    if (!/^https:\/\//i.test(u)) {
      setError('Inserisci un URL HTTPS pubblico.');
      return;
    }
    setBusy(true);
    setBusySubjectId(subjectId ?? null);
    try {
      const text = CLAUDE_ARTIFACT_RE.test(u)
        ? await fetchClaudeArtifactHtml(u)
        : await (async () => {
            const res = await fetch(u);
            if (!res.ok) throw new Error(`Il server ha risposto con errore ${res.status}.`);
            const body = await res.text();
            if (body.length > MAX_BYTES) throw new Error('Il contenuto supera il limite di 12 MB.');
            return body;
          })();
      const t = text.trimStart();
      const looksJson = t.startsWith('{') || t.startsWith('[');
      if (!looksJson && !/\b(?:const|let|var)\s+(?:BANK|QUESTIONS)\s*=\s*\[/.test(text)) {
        throw new Error('Il contenuto non è un JSON né un HTML con archivio BANK o QUESTIONS.');
      }
      const name = u.split('?')[0].split('/').pop() || 'materia';
      setUrl(u);
      setLoaded({ text, fileName: name, sourceUrl: u });
      setTarget(subjectId ?? 'auto');
      setApprove(false);
    } catch (e) {
      if (Platform.OS === 'web' && e instanceof TypeError) {
        setError(
          'Il browser non può leggere questo link direttamente. Scarica il file (JSON o HTML) e importalo con il pulsante rosso "Scegli file JSON o HTML", oppure usa un link GitHub.',
        );
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
      setBusySubjectId(null);
    }
  };

  const confirmImport = () => {
    if (!parsed || !plan) return;
    applyImportPlan({
      target: targetSubject,
      parsed,
      plan,
      approveModified: approve,
      sourceUrl: loaded?.sourceUrl ?? parsed.sourceUrl,
    });
    setLoaded(null);
    Alert.alert('Importazione completata', `"${parsed.title}" è ora la materia attiva.`);
  };

  const shareSubject = async (subject: Subject) => {
    setShareError(null);
    setSharingSubjectId(subject.id);
    try {
      const exported = createSubjectShareExport(subject);
      await shareTextFile(exported.fileName, exported.text, `Condividi ${subject.title}`);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharingSubjectId(null);
    }
  };

  const confirmDelete = (id: string, title: string) =>
    Alert.alert(
      'Eliminare la materia?',
      `"${title}" verrà rimossa con domande, statistiche e sessioni. L’operazione non si può annullare.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Elimina', style: 'destructive', onPress: () => deleteSubject(id) },
      ],
    );

  const cats = parsed
    ? [...new Set(parsed.questions.flatMap((q) => q.sourceCategories ?? []))].join(', ')
    : '';
  const multi = parsed ? parsed.questions.filter((q) => (q.lessonIds?.length ?? 0) > 1).length : 0;

  return (
    <Screen title="Materie" onBack={() => router.back()}>
      {data.subjects.length === 0 && <Notice>Nessuna materia presente: importane una qui sotto.</Notice>}
      {shareError && <Notice tone="danger">{shareError}</Notice>}
      {data.subjects.map((s) => {
        const active = s.id === data.activeSubjectId;
        return (
          <Card key={s.id} tone={active ? 'accent' : 'plain'}>
            <H2>{s.title}</H2>
            <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
              {s.questions.length} domande · {(s.lessons ?? []).length} lezioni
              {active ? ' · attiva' : ''}
            </P>
            {s.sourceUrl && (
              <Text
                numberOfLines={2}
                style={{ fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}
              >
                Link salvato: {s.sourceUrl}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn
                title={active ? 'Materia attiva' : 'Seleziona'}
                small
                variant={active ? 'ghost' : 'ink'}
                disabled={active || busy}
                onPress={() => setActiveSubject(s.id)}
              />
              <Btn
                title="Aggiorna da file"
                small
                variant="ghost"
                icon="file-text"
                loading={busy && busySubjectId === s.id}
                disabled={busy}
                onPress={() => void pickFile(s.id)}
              />
              <Btn
                title="Aggiungi domande"
                small
                variant="ghost"
                icon="plus-circle"
                disabled={busy || sharingSubjectId !== null}
                onPress={() =>
                  router.push({ pathname: '/add-questions', params: { subjectId: s.id } })
                }
              />
              <Btn
                title="Condividi materia"
                small
                variant="ghost"
                icon="share-2"
                loading={sharingSubjectId === s.id}
                disabled={busy || (sharingSubjectId !== null && sharingSubjectId !== s.id)}
                onPress={() => void shareSubject(s)}
              />
              {s.sourceUrl && (
                <Btn
                  title="Aggiorna dal link"
                  small
                  variant="ghost"
                  icon="link"
                  loading={busy && busySubjectId === s.id}
                  disabled={busy}
                  onPress={() => void fetchUrl(s.sourceUrl, s.id)}
                />
              )}
              <Btn
                title="Elimina"
                small
                variant="ghost"
                icon="trash-2"
                disabled={busy}
                onPress={() => confirmDelete(s.id, s.title)}
              />
            </View>
          </Card>
        );
      })}

      <Card>
        <H2>Importa una materia</H2>
        <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
          Scegli un file JSON o HTML dal dispositivo, oppure indica un URL HTTPS pubblico. Il codice dei file HTML non
          viene mai eseguito.
        </P>
        <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
          Negli aggiornamenti, le domande identiche non vengono duplicate; quelle modificate restano invariate finché non
          autorizzi la sostituzione.
        </P>
        <Btn title="Scegli file JSON o HTML" icon="file-text" onPress={pickFile} loading={busy} />
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          placeholderTextColor={colors.mutedForeground}
          style={{
            borderWidth: 1.5,
            borderColor: colors.input,
            borderRadius: radius.base,
            padding: 12,
            fontFamily: fonts.body,
            fontSize: 14.5,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <Btn
          title="Scarica da URL"
          variant="ghost"
          icon="link"
          onPress={() => void fetchUrl()}
          disabled={busy || !url.trim()}
        />
        <Label>Provenienza se non dichiarata</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Rilevamento automatico" selected={defaultOrigin === 'auto'} onPress={() => setDefaultOrigin('auto')} />
          <Chip label="Paniere" selected={defaultOrigin === 'bank'} onPress={() => setDefaultOrigin('bank')} />
          <Chip label="Esami già svolti" selected={defaultOrigin === 'exam'} onPress={() => setDefaultOrigin('exam')} />
        </View>
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      {loaded && parseError && <Notice tone="danger">{parseError}</Notice>}

      {parsed && plan && (
        <Card tone="muted">
          <Label>Anteprima importazione</Label>
          <H2>{parsed.title}</H2>
          <P style={{ fontSize: 14.5 }}>
            {parsed.questions.length} domande riconosciute · {parsed.lessons.length} lezioni · {multi} con più lezioni
          </P>
          <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
            Categorie: {cats}
          </P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Count n={plan.added.length} label="Nuove" color={colors.success} />
            <Count n={plan.identical.length} label="Identiche" color={colors.text} />
            <Count n={plan.modified.length} label="Modificate" color={colors.accentForeground} />
            <Count n={parsed.discarded.length} label="Scartate" color={colors.destructive} />
          </View>

          <Label>Materia di destinazione</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              label={targetSubject ? `Aggiorna "${targetSubject.title}"` : 'Nuova materia'}
              selected={target === 'auto'}
              onPress={() => setTarget('auto')}
            />
            <Chip label="Crea nuova" selected={target === 'new'} onPress={() => setTarget('new')} />
            {data.subjects.map((s) => (
              <Chip key={s.id} label={s.title} selected={target === s.id} onPress={() => setTarget(s.id)} />
            ))}
          </View>

          {parsed.warnings.map((w, i) => (
            <Notice key={i}>{w}</Notice>
          ))}
          {parsed.discarded.length > 0 && (
            <Notice tone="danger">
              <P style={{ fontSize: 14, lineHeight: 20 }}>
                {parsed.discarded.length} domande scartate (risposta non verificabile o dati incompleti):{'\n'}
                {parsed.discarded
                  .slice(0, 5)
                  .map((d) => `${d.ref}: ${d.reason}`)
                  .join('\n')}
                {parsed.discarded.length > 5 ? '\n…' : ''}
              </P>
            </Notice>
          )}

          {plan.modified.length > 0 && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <P style={{ flex: 1, fontSize: 14.5 }}>
                  Sostituisci le {plan.modified.length} versioni modificate (progressi conservati)
                </P>
                <Switch
                  value={approve}
                  onValueChange={setApprove}
                  trackColor={{ false: colors.input, true: colors.accent }}
                  thumbColor={approve ? colors.primary : colors.card}
                />
              </View>
              {plan.modified.slice(0, 3).map(({ old, next }) => (
                <View key={old.id} style={{ backgroundColor: colors.card, borderRadius: radius.base, padding: 10, gap: 4 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.destructive }}>ATTUALE</Text>
                  <P style={{ fontSize: 13.5, lineHeight: 19 }}>{old.q}</P>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: colors.success }}>NUOVA</Text>
                  <P style={{ fontSize: 13.5, lineHeight: 19 }}>{next.q}</P>
                </View>
              ))}
            </View>
          )}

          {plan.added.length > 0 && (
            <View style={{ gap: 6 }}>
              <Label>Esempio di domande nuove</Label>
              {plan.added.slice(0, 3).map((q) => (
                <P key={q.id} style={{ fontSize: 13.5, lineHeight: 19 }} numberOfLines={2}>
                  • {q.q}
                </P>
              ))}
            </View>
          )}

          <Btn title="Conferma importazione" icon="check" onPress={confirmImport} />
          <Btn title="Annulla" variant="ghost" small onPress={() => setLoaded(null)} />
        </Card>
      )}
    </Screen>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color }}>{n}</Text>
      <Label>{label}</Label>
    </View>
  );
}
