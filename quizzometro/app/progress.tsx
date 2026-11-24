import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ActivityCalendar, LessonMasteryRow, LegendChips, MasteryBar, MasteryRing, RecoveryGauge, TrendChart } from '../src/components/charts';
import { Bar, Btn, Card, Chip, Empty, H2, Label, P, Screen } from '../src/components/ui';
import { useLayout } from '../src/components/layout';
import { useStore } from '../src/data/store';
import { lessonProgress, questionCategories, questionLessons, scoreSession, subjectSummary } from '../src/domain/quiz/engine';
import {
  MASTERY_LABELS,
  summarizeMastery,
  summarizePeriod,
  type MasteryPeriod,
} from '../src/domain/quiz/mastery';
import { colors, fonts } from '../src/theme';

const PERIODS: { value: MasteryPeriod; label: string }[] = [
  { value: 'today', label: 'Oggi' },
  { value: '7days', label: '7 giorni' },
  { value: '30days', label: '30 giorni' },
  { value: 'all', label: 'Tutto' },
];

const KIND: Record<string, string> = { original: 'Prova', review: 'Ripasso', repeat: 'Ripetizione' };
const percent = (value: number) => `${String(value).replace('.', ',')}%`;

function SectionHeading({ title, help }: { title: string; help: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <H2 style={{ flex: 1 }}>{title}</H2>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={`Spiegazione: ${title}`}
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          testID={`progress-help-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.55 : 1 })}
        >
          <Feather name={open ? 'x-circle' : 'help-circle'} size={19} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {open && <P color={colors.mutedForeground} style={{ fontSize: 13 }}>{help}</P>}
    </View>
  );
}

export default function Progress() {
  const router = useRouter();
  const { isWide } = useLayout();
  const { data, activeSubject, setActiveSubject, subjectStats, resetProgress, startFromQids } = useStore();
  const subject = activeSubject;
  const stats = subject ? subjectStats(subject.id) : {};
  const [period, setPeriod] = useState<MasteryPeriod>('7days');
  const [lessonSort, setLessonSort] = useState<'order' | 'weak'>('order');
  const [selectedLesson, setSelectedLesson] = useState<number | null>(null);

  const report = useMemo(() => {
    if (!subject) return null;
    const mastery = summarizeMastery(subject.questions, stats);
    const periodSummary = summarizePeriod(subject.questions, stats, period);
    const overall = subjectSummary(subject, stats);
    const lessons = lessonProgress(subject, stats).map((lesson) => {
      const questions = subject.questions.filter((question) => questionLessons(question).includes(lesson.number));
      return { ...lesson, questions, mastery: summarizeMastery(questions, stats) };
    });
    const categories = new Map<string, { seen: number; total: number }>();
    subject.questions.forEach((question) => {
      questionCategories(question).forEach((category) => {
        const value = categories.get(category) ?? { seen: 0, total: 0 };
        value.total++;
        if ((stats[question.id]?.seen ?? 0) > 0) value.seen++;
        categories.set(category, value);
      });
    });
    const hard = subject.questions
      .filter((question) => (stats[question.id]?.wrong ?? 0) > 0)
      .slice()
      .sort((a, b) => (stats[b.id]?.wrong ?? 0) - (stats[a.id]?.wrong ?? 0))
      .slice(0, 8);
    const finished = data.sessions
      .filter((session) => session.subjectId === subject.id && session.finishedAt !== null)
      .slice()
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    const weakLessons = lessons
      .filter((lesson) => lesson.answeredAttempts >= 2)
      .slice()
      .sort((a, b) => (a.accuracyPct ?? 100) - (b.accuracyPct ?? 100))
      .slice(0, 6);
    return {
      mastery,
      periodSummary,
      overall,
      lessons,
      categories,
      hard,
      finished: finished.slice(0, 10),
      originalCount: finished.filter((session) => session.kind === 'original').length,
      weakLessons,
    };
  }, [subject, stats, data.sessions, period]);

  if (!subject || !report) {
    return (
      <Screen title="Andamento" onBack={() => router.back()}>
        <Empty title="Nessuna materia" text="Importa o seleziona una materia per vedere i progressi." />
        <Btn title="Vai alle Materie" icon="book-open" onPress={() => router.push('/subjects')} />
      </Screen>
    );
  }

  const byId = new Map(subject.questions.map((question) => [question.id, question]));
  const orderedLessons = report.lessons.slice().sort((a, b) =>
    lessonSort === 'weak'
      ? a.mastery.learnedPercent - b.mastery.learnedPercent ||
        b.mastery.counts.recover - a.mastery.counts.recover ||
        a.number - b.number
      : a.number - b.number,
  );
  const detail = selectedLesson === null ? null : report.lessons.find((lesson) => lesson.number === selectedLesson) ?? null;
  const hasAnswers = report.overall.totalAnswers > 0;

  const train = (questionIds: string[], label: string) => {
    if (!questionIds.length) {
      Alert.alert('Nessuna domanda', 'Non ci sono domande disponibili per questo allenamento.');
      return;
    }
    const id = startFromQids({
      subjectId: subject.id,
      qids: questionIds,
      kind: 'review',
      label: `Allenamento · ${label}`,
      keepOrder: false,
    });
    if (!id) {
      Alert.alert('Nessuna domanda', 'Non ci sono più domande disponibili per questo allenamento.');
      return;
    }
    router.push('/quiz');
  };

  const reset = () =>
    Alert.alert(
      'Azzerare i progressi?',
      `Statistiche, registro delle risposte e cronologia di "${subject.title}" verranno eliminati in modo irreversibile. Le domande restano.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Azzera', style: 'destructive', onPress: () => resetProgress(subject.id) },
      ],
    );

  const categoryCoverage = (
    <Card>
      <SectionHeading
        title="Copertura per categoria"
        help="Mostra quante domande di ogni categoria hai incontrato almeno una volta, rispetto al totale."
      />
      {[...report.categories.entries()].map(([category, value]) => (
        <View key={category} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <P style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>{category}</P>
            <P color={colors.mutedForeground} style={{ fontSize: 13 }}>{value.seen}/{value.total}</P>
          </View>
          <Bar value={value.total ? value.seen / value.total : 0} color={colors.success} />
        </View>
      ))}
    </Card>
  );

  return (
    <Screen title="Andamento" onBack={() => router.back()}>
      {data.subjects.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.subjects.map((item) => (
            <Chip key={item.id} label={item.title} selected={item.id === subject.id} onPress={() => setActiveSubject(item.id)} />
          ))}
        </View>
      )}

      <Card tone="ink">
        <Label color={colors.accent}>Materia attiva</Label>
        <Text style={{ color: colors.secondaryForeground, fontFamily: fonts.displayHeavy, fontSize: 23 }}>
          {subject.title}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {PERIODS.map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              selected={period === item.value}
              tone="ink"
              onPress={() => setPeriod(item.value)}
              testID={`progress-period-${item.value}`}
            />
          ))}
        </View>
      </Card>

      {!hasAnswers ? (
        <Card>
          <Empty title="Nessun progresso ancora" text="Fai la prima prova per vedere qui i tuoi progressi." />
          <Btn
            title="Vai alla scheda Quiz"
            icon="play-circle"
            onPress={() => router.push({ pathname: '/', params: { section: 'quiz' } })}
            testID="progress-empty-quiz"
          />
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 14 }}>
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
          <Card>
            <SectionHeading
              title="Il tuo livello"
              help="Le domande sono classificate in base alla prima risposta di ogni giornata. Per risultare imparata, una domanda deve avere risposte corrette in due giorni distanti almeno due giorni."
            />
            <View style={{ alignItems: 'center', paddingVertical: 4 }}>
              <MasteryRing distribution={report.mastery} size={180} />
            </View>
            <P style={{ textAlign: 'center', fontFamily: fonts.bodySemi }}>
              Hai imparato {report.mastery.counts.learned} domande su {report.mastery.total}. {report.mastery.counts.recover} sono da recuperare.
            </P>
            <LegendChips
              questions={subject.questions}
              distribution={report.mastery}
              onTrain={(ids, state) => train(ids, MASTERY_LABELS[state].toLowerCase())}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
              <Metric label="Risposte totali" value={String(report.overall.totalAnswers)} />
              <Metric label="Accuratezza totale" value={report.overall.accuracy === null ? '–' : percent(report.overall.accuracy)} />
              <Metric label="Incontrate" value={`${report.overall.met}/${report.overall.total}`} />
              <Metric label="Prove" value={String(report.originalCount)} />
            </View>
          </Card>

            </View>
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
          <Card>
            <SectionHeading
              title="Recupero errori"
              help="Qui vedi quante domande sbagliate nel periodo hai poi recuperato, cioè corrette in seguito e ora imparate o da ripassare."
            />
            <RecoveryGauge
              recovered={report.periodSummary.recoveryCount}
              wrong={report.periodSummary.wrongQuestionCount}
              percentage={report.periodSummary.recoveryPercent}
            />
            <Btn
              title="Allenati sulle domande da recuperare"
              icon="rotate-ccw"
              variant="soft"
              onPress={() => train(subject.questions.filter((q) => report.mastery.statesById[q.id] === 'recover').map((q) => q.id), 'domande da recuperare')}
              disabled={report.mastery.counts.recover === 0}
              testID="progress-train-recover"
            />
          </Card>
            </View>
          </View>

          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 14 }}>
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
          <Card>
            <SectionHeading
              title="Andamento"
              help="La linea mostra l’accuratezza delle risposte per giornata; le colonne indicano quante risposte hai dato. Tocca il grafico per leggere un giorno."
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Metric label="Accuratezza nel periodo" value={report.periodSummary.accuracyPercent === null ? '–' : percent(report.periodSummary.accuracyPercent)} />
              <Metric label="Risposte nel periodo" value={String(report.periodSummary.totalAnswers)} />
            </View>
            <TrendChart points={report.periodSummary.daily} />
          </Card>

            </View>
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
          <Card>
            <SectionHeading
              title="Costanza"
              help="Ogni quadratino rappresenta un giorno. Un colore più intenso indica più risposte; il conteggio considera il periodo selezionato."
            />
            <ActivityCalendar points={report.periodSummary.daily} />
          </Card>
            </View>
          </View>

          <Card>
            <SectionHeading
              title="Per lezione"
              help="La percentuale indica quante domande della lezione risultano imparate. Tocca una riga per vedere i singoli stati e avviare un allenamento."
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <Chip label="Ordine lezioni" selected={lessonSort === 'order'} onPress={() => setLessonSort('order')} />
              <Chip label="Più deboli prima" selected={lessonSort === 'weak'} onPress={() => setLessonSort('weak')} />
            </View>
            {orderedLessons.map((lesson) => (
              <View key={lesson.number} style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                <LessonMasteryRow
                  number={lesson.number}
                  title={lesson.title}
                  distribution={lesson.mastery}
                  onPress={() => setSelectedLesson(selectedLesson === lesson.number ? null : lesson.number)}
                />
                {detail?.number === lesson.number && (
                  <View style={{ gap: 8, paddingBottom: 12 }}>
                    <MasteryBar counts={detail.mastery.counts} total={detail.mastery.total} height={7} />
                    <P color={colors.mutedForeground} style={{ fontSize: 12.5 }}>
                      {detail.seenQuestions}/{detail.totalQuestions} affrontate ·{' '}
                      {detail.accuracyPct === null ? 'nessuna risposta' : `${percent(detail.accuracyPct)} corrette`}
                    </P>
                    <LegendChips
                      compact
                      questions={detail.questions}
                      distribution={detail.mastery}
                      onTrain={(ids, state) => train(ids, `lezione ${detail.number} · ${MASTERY_LABELS[state].toLowerCase()}`)}
                    />
                    <Btn
                      title="Allenati su questa lezione"
                      small
                      icon="play"
                      onPress={() => train(detail.questions.map((question) => question.id), `lezione ${detail.number}`)}
                    />
                  </View>
                )}
              </View>
            ))}
          </Card>

          {isWide && categoryCoverage}

          <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 14 }}>
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
              <Card>
                <SectionHeading
                  title="Lezioni da rinforzare"
                  help="Queste lezioni hanno almeno due risposte registrate e l’accuratezza più bassa. La percentuale si basa su tutte le risposte date."
                />
                {report.weakLessons.length === 0 ? (
                  <P color={colors.mutedForeground}>Servono almeno 2 risposte per lezione.</P>
                ) : (
                  report.weakLessons.map((lesson) => (
                    <View key={lesson.number} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <P style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 14 }} numberOfLines={2}>
                          <Text style={{ fontFamily: fonts.bodyBold }}>L{lesson.number}</Text>
                          {lesson.title ? ` · ${lesson.title}` : ''}
                        </P>
                        <P color={colors.destructive} style={{ fontFamily: fonts.bodyBold }}>
                          {percent(Math.round((lesson.accuracyPct ?? 0) * 10) / 10)}
                        </P>
                      </View>
                      <Bar value={(lesson.accuracyPct ?? 0) / 100} color={colors.destructive} height={6} />
                    </View>
                  ))
                )}
              </Card>
            </View>
            {!isWide && categoryCoverage}
            <View style={isWide ? { flex: 1, minWidth: 0 } : { width: '100%' }}>
              <Card>
                <SectionHeading
                  title="Domande più difficili"
                  help="Sono le domande con più risposte sbagliate registrate. Un errore non impedisce di recuperarle con l’esercizio."
                />
                {report.hard.length === 0 ? (
                  <P color={colors.mutedForeground}>Nessun errore registrato finora.</P>
                ) : (
                  report.hard.map((question) => (
                    <View key={question.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.destructive }}>
                          {stats[question.id].wrong}×
                        </Text>
                      </View>
                      <P style={{ flex: 1, fontSize: 14.5 }} numberOfLines={3}>{question.q}</P>
                    </View>
                  ))
                )}
              </Card>
            </View>
          </View>

          <Card>
            <SectionHeading
              title="Ultime sessioni"
              help="Apri una sessione per rivedere il risultato. La cronologia conserva le prove, i ripassi e le ripetizioni ancora salvate."
            />
            {report.finished.length === 0 ? (
              <P color={colors.mutedForeground}>Nessuna sessione conclusa.</P>
            ) : (
              report.finished.map((session) => {
                const score = scoreSession(session, byId);
                const date = new Date(session.finishedAt ?? session.startedAt);
                return (
                  <Pressable
                    key={session.id}
                    onPress={() => router.push({ pathname: '/results', params: { id: session.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Apri ${KIND[session.kind]}, ${score.correct} corrette su ${score.total}`}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      opacity: pressed ? 0.62 : 1,
                    })}
                  >
                    <View style={{ flex: 1 }}>
                      <P style={{ fontFamily: fonts.bodySemi, fontSize: 14 }}>
                        {KIND[session.kind]}
                        {session.endReason === 'partial' ? ' · parziale' : session.endReason === 'timeout' ? ' · scaduta' : ''}
                      </P>
                      <P color={colors.mutedForeground} style={{ fontSize: 12.5 }}>
                        {date.toLocaleDateString('it-IT')} {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </P>
                    </View>
                    <P style={{ fontFamily: fonts.bodyBold, fontSize: 13 }}>
                      {score.correct}/{score.total} · {percent(score.pct)}
                    </P>
                  </Pressable>
                );
              })
            )}
          </Card>
        </>
      )}

      <Card>
        <SectionHeading
          title="Azzera i progressi"
          help="Le domande importate non vengono cancellate. Si eliminano statistiche, registro e sessioni di questa materia e non si possono recuperare."
        />
        <Btn title="Azzera i progressi di questa materia" variant="danger" icon="trash-2" onPress={reset} />
      </Card>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 100, flexGrow: 1 }}>
      <Text style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 18 }}>{value}</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}
