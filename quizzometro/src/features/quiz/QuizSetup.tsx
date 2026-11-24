import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { Btn, Card, Chip, H2, Label, P } from '../../components/ui';
import { useLayout } from '../../components/layout';
import { useStore } from '../../data/store';
import {
  allCategories,
  allLessons,
  filterQuestions,
  INEDITE_QUIZ_PERCENT,
  isInediteQuestion,
  type QuizMode,
  type StatusFilter,
} from '../../domain/quiz/engine';
import { LegendChips, MasteryBar } from '../../components/charts';
import { MASTERY_LABELS, summarizeMastery, type MasteryState } from '../../domain/quiz/mastery';
import {
  defaultQuizPreferences,
  firstNLessons,
  lastNLessons,
  lessonsInRange,
  quizPreferencesForSubject,
  validateQuizPreferences,
} from '../../domain/quiz/preferences';
import type { QuizPreferences, Subject } from '../../domain/types';
import { colors, fonts, radius } from '../../theme';

const COUNTS = [10, 20, 30] as const;
const TIMERS = [10, 20, 30] as const;
const STATUSES: { v: StatusFilter; l: string }[] = [
  { v: 'all', l: 'Tutte' },
  { v: 'seen', l: 'Già viste' },
  { v: 'unseen', l: 'Non viste' },
  { v: 'wrong', l: 'Sbagliate' },
  { v: 'recover', l: 'Da recuperare' },
  { v: 'review', l: 'Da ripassare' },
];

function NumberInput({
  value,
  onChange,
  placeholder,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onBlur?: () => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
      onBlur={onBlur}
      keyboardType="number-pad"
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground}
      style={{
        minWidth: 90,
        borderWidth: 1.5,
        borderColor: colors.input,
        borderRadius: radius.base,
        paddingHorizontal: 12,
        paddingVertical: 7,
        fontFamily: fonts.bodySemi,
        fontSize: 14,
        color: colors.text,
        backgroundColor: colors.card,
      }}
    />
  );
}

export function QuizSetup({ subject }: { subject: Subject }) {
  const router = useRouter();
  const { startQuiz, startFromQids, subjectStats, data, saveQuizPreferences } = useStore();
  const { isWide } = useLayout();
  const stats = subjectStats(subject.id);
  const cats = useMemo(() => allCategories(subject), [subject]);
  const lessons = useMemo(() => allLessons(subject), [subject]);
  const hasInedite = useMemo(() => subject.questions.some(isInediteQuestion), [subject.questions]);
  const [preferences, setPreferences] = useState<QuizPreferences>(() => quizPreferencesForSubject(data.settings, subject));
  const [lessonQuickNText, setLessonQuickNText] = useState(String(preferences.lessonQuickN));
  const effectiveMode: QuizMode = hasInedite ? preferences.mode : 'mixed';
  const selCats = preferences.categories === 'all' ? cats : preferences.categories;
  const lessonNumbers = lessons.map((lesson) => lesson.number);
  const selLessons = preferences.lessons === 'all' ? lessonNumbers : preferences.lessons;
  const quickN = Math.min(preferences.lessonQuickN, lessons.length);

  useEffect(() => {
    saveQuizPreferences(subject.id, preferences);
  }, [subject, preferences, saveQuizPreferences]);

  useEffect(() => {
    const validated = validateQuizPreferences(preferences, subject);
    if (JSON.stringify(validated) !== JSON.stringify(preferences)) setPreferences(validated);
  }, [subject, preferences]);

  useEffect(() => {
    setLessonQuickNText(String(preferences.lessonQuickN));
  }, [subject.id, preferences.lessonQuickN]);

  const updatePreferences = (patch: Partial<QuizPreferences>) =>
    setPreferences((current) => ({ ...current, ...patch }));

  const pool = useMemo(
    () =>
      filterQuestions(
        subject,
        stats,
        { categories: selCats, lessons: selLessons, status: preferences.status, onlyDates: preferences.onlyDates, mode: effectiveMode },
        cats.length,
        lessons.length,
      ),
    [subject, stats, selCats, selLessons, preferences.status, preferences.onlyDates, effectiveMode, cats.length, lessons.length],
  );
  const progressPool = useMemo(
    () =>
      filterQuestions(
        subject,
        stats,
        { categories: selCats, lessons: selLessons, status: 'all', onlyDates: preferences.onlyDates, mode: effectiveMode },
        cats.length,
        lessons.length,
      ),
    [subject, stats, selCats, selLessons, preferences.onlyDates, effectiveMode, cats.length, lessons.length],
  );
  const mastery = useMemo(() => summarizeMastery(progressPool, stats), [progressPool, stats]);

  const requested: number | null =
    preferences.countSel === 'all'
      ? null
      : preferences.countSel === 'custom'
        ? parseInt(preferences.customCount, 10) || 0
        : preferences.countSel;
  const final = requested === null ? pool.length : Math.min(requested, pool.length);
  const timerMin: number | null =
    preferences.timerSel === 'off'
      ? null
      : preferences.timerSel === 'custom'
        ? parseInt(preferences.customTimer, 10) || 0
        : preferences.timerSel;

  const changeQuickN = (text: string) => {
    setLessonQuickNText(text);
    const value = Number.parseInt(text, 10);
    if (Number.isFinite(value) && lessons.length) {
      updatePreferences({ lessonQuickN: Math.max(1, Math.min(lessons.length, value)) });
    }
  };

  const normalizeQuickN = () => {
    const value = Number.parseInt(lessonQuickNText, 10);
    const next = lessons.length
      ? Math.max(1, Math.min(lessons.length, Number.isFinite(value) ? value : preferences.lessonQuickN))
      : 0;
    setLessonQuickNText(String(next));
    updatePreferences({ lessonQuickN: next });
  };

  const selectRange = () => {
    const from = Number.parseInt(preferences.intervalFrom, 10);
    const to = Number.parseInt(preferences.intervalTo, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      Alert.alert('Intervallo non valido', 'Inserisci entrambe le lezioni dell’intervallo.');
      return;
    }
    updatePreferences({ lessons: lessonsInRange(subject, from, to) });
  };

  const start = () => {
    if (preferences.countSel === 'custom' && !(requested && requested > 0)) {
      Alert.alert('Quantità non valida', 'Inserisci un numero di domande maggiore di zero.');
      return;
    }
    if (preferences.timerSel === 'custom' && !(timerMin && timerMin >= 1)) {
      Alert.alert('Timer non valido', 'Il timer personalizzato deve essere di almeno 1 minuto.');
      return;
    }
    const id = startQuiz(subject.id, {
      count: requested,
      timerMin,
      categories: selCats,
      lessons: selLessons,
      status: preferences.status,
      onlyDates: preferences.onlyDates,
      mode: effectiveMode,
    });
    if (!id) {
      Alert.alert('Nessuna domanda', 'Con questi filtri non ci sono domande disponibili.');
      return;
    }
    router.push('/quiz');
  };

  const trainOnState = (questionIds: string[], state: MasteryState) => {
    const id = startFromQids({
      subjectId: subject.id,
      qids: questionIds,
      kind: 'review',
      label: `Allenamento · ${MASTERY_LABELS[state].toLowerCase()}`,
      keepOrder: false,
    });
    if (!id) {
      Alert.alert('Nessuna domanda', 'Non ci sono più domande disponibili in questo stato.');
      return;
    }
    router.push('/quiz');
  };

  return (
    <Card>
      <H2>Nuova prova</H2>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          {hasInedite && (
            <>
              <Label>Tipo di prova</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip
                  label="Misto"
                  selected={preferences.mode === 'mixed'}
                  onPress={() => updatePreferences({ mode: 'mixed' })}
                  testID="quiz-mode-mixed"
                />
                <Chip
                  label="Solo Inedite"
                  selected={preferences.mode === 'inedite'}
                  onPress={() => updatePreferences({ mode: 'inedite' })}
                  testID="quiz-mode-inedite"
                />
              </View>
              <P color={colors.mutedForeground} style={{ fontSize: 13.5 }}>
                {effectiveMode === 'mixed'
                  ? `Nel quiz misto, circa il ${INEDITE_QUIZ_PERCENT}% delle domande sarà composto da Inedite, se le categorie selezionate le includono.`
                  : 'Solo domande Inedite. Il capitolo filtra quelle indicizzate; le altre restano disponibili.'}
              </P>
            </>
          )}
          <Label>Quantità</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {COUNTS.map((count) => (
              <Chip
                key={count}
                label={String(count)}
                selected={preferences.countSel === count}
                onPress={() => updatePreferences({ countSel: count })}
              />
            ))}
            <Chip
              label="Tutte"
              selected={preferences.countSel === 'all'}
              onPress={() => updatePreferences({ countSel: 'all' })}
            />
            <Chip
              label="Altro"
              selected={preferences.countSel === 'custom'}
              onPress={() => updatePreferences({ countSel: 'custom' })}
            />
            {preferences.countSel === 'custom' && (
              <NumberInput
                value={preferences.customCount}
                onChange={(customCount) => updatePreferences({ customCount })}
                placeholder="Domande"
              />
            )}
          </View>
          <Label>Timer</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Chip
              label="Nessuno"
              selected={preferences.timerSel === 'off'}
              onPress={() => updatePreferences({ timerSel: 'off' })}
            />
            {TIMERS.map((timer) => (
              <Chip
                key={timer}
                label={`${timer} min`}
                selected={preferences.timerSel === timer}
                onPress={() => updatePreferences({ timerSel: timer })}
              />
            ))}
            <Chip
              label="Altro"
              selected={preferences.timerSel === 'custom'}
              onPress={() => updatePreferences({ timerSel: 'custom' })}
            />
            {preferences.timerSel === 'custom' && (
              <NumberInput
                value={preferences.customTimer}
                onChange={(customTimer) => updatePreferences({ customTimer })}
                placeholder="Minuti"
              />
            )}
          </View>
          <Label>Stato delle domande</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {STATUSES.map((item) => (
              <Chip
                key={item.v}
                label={item.l}
                selected={preferences.status === item.v}
                onPress={() => updatePreferences({ status: item.v })}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <P style={{ flex: 1, fontSize: 14.5 }}>Solo domande con date</P>
            <Switch
              value={preferences.onlyDates}
              onValueChange={(onlyDates) => updatePreferences({ onlyDates })}
              trackColor={{ false: colors.input, true: colors.accent }}
              thumbColor={preferences.onlyDates ? colors.primary : colors.card}
            />
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <Btn
            title={preferences.showFilters ? 'Nascondi categorie e lezioni' : 'Categorie e lezioni'}
            variant="ghost"
            small
            icon={preferences.showFilters ? 'chevron-up' : 'sliders'}
            onPress={() => updatePreferences({ showFilters: !preferences.showFilters })}
          />
          {preferences.showFilters && (
            <View style={{ gap: 10 }}>
              {effectiveMode === 'mixed' && (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Label>Categorie ({selCats.length}/{cats.length})</Label>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Btn title="Tutte" small variant="ghost" onPress={() => updatePreferences({ categories: 'all' })} />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {cats.map((category) => (
                      <Chip
                        key={category}
                        label={category}
                        selected={selCats.includes(category)}
                        onPress={() =>
                          updatePreferences({
                            categories: selCats.includes(category)
                              ? selCats.length === 1
                                ? 'all'
                                : selCats.filter((item) => item !== category)
                              : [...selCats, category],
                          })
                        }
                      />
                    ))}
                  </View>
                </>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Label>Lezioni ({selLessons.length}/{lessons.length})</Label>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Btn title="Tutte" small variant="ghost" onPress={() => updatePreferences({ lessons: 'all' })} />
                </View>
              </View>
              {lessons.length > 0 && (
                <>
                  <Label>Selezione rapida delle lezioni</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <P style={{ fontSize: 13.5 }}>N</P>
                    <NumberInput
                      value={lessonQuickNText}
                      onChange={changeQuickN}
                      onBlur={normalizeQuickN}
                      placeholder="N"
                    />
                    <Btn
                      title={`Primi ${quickN}`}
                      small
                      variant="ghost"
                      onPress={() => updatePreferences({ lessons: firstNLessons(subject, quickN) })}
                      testID="quiz-lessons-first"
                    />
                    <Btn
                      title={`Ultimi ${quickN}`}
                      small
                      variant="ghost"
                      onPress={() => updatePreferences({ lessons: lastNLessons(subject, quickN) })}
                      testID="quiz-lessons-last"
                    />
                  </View>
                  <Label>Intervallo</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                    <View style={{ gap: 4 }}>
                      <P style={{ fontSize: 12.5 }}>Dalla lezione</P>
                      <NumberInput
                        value={preferences.intervalFrom}
                        onChange={(intervalFrom) => updatePreferences({ intervalFrom })}
                        placeholder="Da"
                      />
                    </View>
                    <View style={{ gap: 4 }}>
                      <P style={{ fontSize: 12.5 }}>Alla lezione</P>
                      <NumberInput
                        value={preferences.intervalTo}
                        onChange={(intervalTo) => updatePreferences({ intervalTo })}
                        placeholder="A"
                      />
                    </View>
                    <Btn title="Seleziona" small icon="check" onPress={selectRange} testID="quiz-lessons-range" />
                  </View>
                </>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {lessons.map((lesson) => (
                  <View key={lesson.number} style={{ width: '20%', alignItems: 'center', paddingVertical: 3 }}>
                    <Chip
                      label={`L${lesson.number}`}
                      selected={selLessons.includes(lesson.number)}
                      onPress={() =>
                        updatePreferences({
                          lessons: selLessons.includes(lesson.number)
                            ? selLessons.length === 1
                              ? 'all'
                              : selLessons.filter((number) => number !== lesson.number)
                            : [...selLessons, lesson.number],
                        })
                      }
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
            Disponibili con questi filtri: {pool.length}. La prova avrà {final} {final === 1 ? 'domanda' : 'domande'}.
          </P>
          <View
            testID="quiz-progress-summary"
            style={{ backgroundColor: colors.muted, borderRadius: radius.base, padding: 12, gap: 5 }}
          >
            <P style={{ fontFamily: fonts.bodySemi, fontSize: 14.5 }}>
              Lezioni selezionate: {selLessons.length} · {mastery.total} {mastery.total === 1 ? 'domanda' : 'domande'}
            </P>
            <MasteryBar counts={mastery.counts} total={mastery.total} height={8} />
            <LegendChips compact questions={progressPool} distribution={mastery} onTrain={trainOnState} />
          </View>
          <Btn title="Avvia prova" icon="play" onPress={start} disabled={pool.length === 0} />
          <Btn
            title="Ripristina impostazioni predefinite"
            small
            variant="ghost"
            onPress={() => {
              const defaults = defaultQuizPreferences(subject);
              setLessonQuickNText(String(defaults.lessonQuickN));
              setPreferences(defaults);
            }}
            testID="quiz-reset-preferences"
          />
        </View>
      </View>
    </Card>
  );
}
