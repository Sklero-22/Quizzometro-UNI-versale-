import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Btn, Card, H2, Label, Notice, P, Screen } from '../src/components/ui';
import { useLayout } from '../src/components/layout';
import { useStore } from '../src/data/store';
import { createPasteImportPreview } from '../src/domain/import/pasteImport';
import { parsePastedQuestions, type PasteParseResult } from '../src/domain/import/pasteParser';
import { createSubjectShareExport } from '../src/domain/import/subjectShare';
import { shareTextFile } from '../src/platform/files';
import { colors, fonts, radius } from '../src/theme';

export default function AddQuestions() {
  const router = useRouter();
  const { isWide } = useLayout();
  const params = useLocalSearchParams<{ subjectId?: string | string[] }>();
  const subjectId = Array.isArray(params.subjectId) ? params.subjectId[0] : params.subjectId;
  const { data, applyImportPlan } = useStore();
  const subject = data.subjects.find((item) => item.id === subjectId);
  const [text, setText] = useState('');
  const [checked, setChecked] = useState<PasteParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sharePromptOpen, setSharePromptOpen] = useState(false);
  const [shareSubjectId, setShareSubjectId] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const preview = useMemo(
    () => (subject && checked ? createPasteImportPreview(subject, checked.questions) : null),
    [subject, checked],
  );

  const checkQuestions = () => {
    setChecked(parsePastedQuestions(text));
    setMessage(null);
  };

  const addQuestions = () => {
    if (!subject || !preview) return;
    const addedCount = preview.plan.added.length;
    if (addedCount === 0) {
      setMessage('Non ci sono nuove domande da aggiungere: quelle valide risultano già presenti o simili a domande esistenti.');
      return;
    }

    applyImportPlan({
      target: subject,
      parsed: preview.parsed,
      plan: preview.plan,
      approveModified: false,
      sourceUrl: subject.sourceUrl,
    });
    setShareSubjectId(subject.id);
    setShareError(null);
    setSharePromptOpen(true);
  };

  const shareUpdatedSubject = async () => {
    const updatedSubject =
      data.subjects.find((item) => item.id === shareSubjectId) ?? subject;
    if (!updatedSubject) {
      setShareError('La materia non è più disponibile.');
      return;
    }
    setSharing(true);
    setShareError(null);
    try {
      const exported = createSubjectShareExport(updatedSubject);
      await shareTextFile(exported.fileName, exported.text, `Condividi ${updatedSubject.title}`);
      setSharePromptOpen(false);
      router.back();
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  const closeSharePrompt = () => {
    setSharePromptOpen(false);
    router.back();
  };

  if (!subject) {
    return (
      <Screen title="Aggiungi domande" onBack={() => router.back()}>
        <Notice tone="danger">La materia selezionata non è più disponibile.</Notice>
        <Btn title="Torna alle materie" variant="ink" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title="Aggiungi domande" onBack={() => router.back()}>
      <Card tone="accent">
        <Label>MATERIA</Label>
        <H2>{subject.title}</H2>
        <P color={colors.mutedForeground}>
          Incolla una o più domande. Quelle già presenti non verranno aggiunte una seconda volta e i tuoi progressi
          resteranno invariati.
        </P>
      </Card>

      <View style={{ flexDirection: isWide && checked ? 'row' : 'column', gap: 14, alignItems: 'flex-start' }}>
        <View style={isWide && checked ? { flex: 1, minWidth: 0, gap: 14 } : { width: '100%', gap: 14 }}>
      <Card>
        <H2>Formato da incollare</H2>
        <P color={colors.mutedForeground} style={styles.example}>
          {'LEZIONI: 18\nFONTE: inedita\nDOMANDA: Scrivi qui la domanda\nCORRETTA: Risposta giusta\nERRATA: Prima risposta sbagliata\nERRATA: Seconda risposta sbagliata\nERRATA: Terza risposta sbagliata\nSPIEGAZIONE: Facoltativa'}
        </P>
        <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
          Le domande si separano con una riga vuota. Sono accettate le fonti “paniere” e “inedita”; le lezioni e la
          fonte possono essere omesse dopo la prima domanda. La spiegazione è facoltativa.
        </P>
        <TextInput
          accessibilityLabel="Testo delle domande da aggiungere"
          multiline
          value={text}
          onChangeText={(value) => {
            setText(value);
            setChecked(null);
            setMessage(null);
          }}
          placeholder="Incolla qui le domande..."
          placeholderTextColor={colors.mutedForeground}
          textAlignVertical="top"
          style={styles.input}
          testID="pasted-questions-input"
        />
        <Btn title="Controlla" icon="check-circle" onPress={checkQuestions} disabled={!text.trim()} />
      </Card>

      {message && <Notice tone="accent">{message}</Notice>}
        </View>

      {checked && (
        <View style={isWide ? { flex: 1, minWidth: 0, gap: 14 } : { width: '100%', gap: 14 }}>
          <Card>
            <H2>Anteprima</H2>
            <P color={colors.mutedForeground}>
              {checked.questions.length} domande valide · {checked.errors.length} errori
            </P>
            {checked.errors.length > 0 && (
              <Notice tone="danger">
                <View style={{ gap: 5 }}>
                  {checked.errors.map((error, index) => (
                    <Text key={`${error.line}-${index}`} style={styles.errorText}>
                      {error.message}
                    </Text>
                  ))}
                  <Text style={styles.errorText}>
                    Puoi comunque aggiungere le domande valide mostrate qui sotto.
                  </Text>
                </View>
              </Notice>
            )}
            {checked.questions.length === 0 && (
              <Notice tone="danger">Non ho trovato domande complete. Controlla le etichette e riprova.</Notice>
            )}
            {checked.questions.length > 0 && preview?.plan.added.length === 0 && (
              <Notice tone="accent">
                Non ci sono nuove domande da aggiungere: quelle valide risultano già presenti o simili a domande esistenti.
              </Notice>
            )}
            {preview?.items.map(({ pasted, status }, index) => (
              <View
                key={`${pasted.line}-${index}`}
                style={[styles.previewQuestion, index > 0 && styles.previewDivider]}
              >
                <View style={styles.previewHeading}>
                  <Label color={pasted.source === 'inedita' ? colors.primary : colors.mutedForeground}>
                    Lezione {pasted.lessonIds.join(', ')} · {pasted.source === 'inedita' ? 'Inedita' : 'Paniere'}
                  </Label>
                  <Text
                    style={[
                      styles.status,
                      status === 'new' ? styles.statusNew : styles.statusExisting,
                    ]}
                  >
                    {status === 'new'
                      ? 'Da aggiungere'
                      : status === 'already-present'
                        ? 'Già presente'
                        : status === 'duplicate-in-paste'
                          ? 'Ripetuta nel testo'
                          : 'Simile a una domanda esistente'}
                  </Text>
                </View>
                <Text style={styles.questionText}>{pasted.question}</Text>
                <Text style={styles.correctLabel}>Risposta corretta</Text>
                <Text style={styles.correctAnswer}>{pasted.correctAnswer}</Text>
              </View>
            ))}
            {preview && preview.plan.modified.length > 0 && (
              <Notice tone="accent">
                Le domande simili a quelle esistenti non verranno sostituite, così i progressi già registrati restano
                intatti.
              </Notice>
            )}
          </Card>
          <Btn
            title="Aggiungi alla materia"
            icon="plus-circle"
            variant="ink"
            onPress={addQuestions}
            disabled={!preview || preview.plan.added.length === 0}
            testID="add-pasted-questions"
          />
        </View>
      )}
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={sharePromptOpen}
        onRequestClose={closeSharePrompt}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <H2>Domande aggiunte!</H2>
            <P>Vuoi condividere la materia aggiornata con i colleghi?</P>
            {shareError && <Notice tone="danger">{shareError}</Notice>}
            <View style={styles.modalActions}>
              <Btn
                title="Non ora"
                variant="ghost"
                disabled={sharing}
                onPress={closeSharePrompt}
                style={styles.modalButton}
              />
              <Btn
                title="Condividi"
                variant="primary"
                icon="share-2"
                loading={sharing}
                disabled={sharing}
                onPress={() => void shareUpdatedSubject()}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  example: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    lineHeight: 19,
    backgroundColor: colors.muted,
    borderRadius: radius.base,
    padding: 12,
  },
  input: {
    minHeight: 240,
    maxHeight: 440,
    borderWidth: 1.5,
    borderColor: colors.input,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    padding: 14,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  errorText: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 19,
  },
  previewQuestion: {
    gap: 6,
    paddingTop: 10,
  },
  previewDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  previewHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  statusNew: {
    color: colors.success,
  },
  statusExisting: {
    color: colors.mutedForeground,
  },
  questionText: {
    fontFamily: fonts.bodyMedium,
    color: colors.text,
    fontSize: 14.5,
    lineHeight: 21,
  },
  correctLabel: {
    fontFamily: fonts.bodyBold,
    color: colors.success,
    fontSize: 12,
    marginTop: 2,
  },
  correctAnswer: {
    fontFamily: fonts.bodySemi,
    color: colors.success,
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
    backgroundColor: 'rgba(31, 35, 71, 0.58)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    gap: 14,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.card,
    padding: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalButton: {
    flex: 1,
  },
});
