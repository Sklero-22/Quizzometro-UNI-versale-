import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Switch, TextInput, View } from 'react-native';
import { Btn, Card, Chip, H2, Label, P } from '../../components/ui';
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
import type { Subject } from '../../domain/types';
import { colors, fonts, radius } from '../../theme';

const COUNTS = [10, 20, 30];
const TIMERS = [10, 20, 30];
const STATUSES: { v: StatusFilter; l: string }[] = [
  { v: 'all', l: 'Tutte' },
  { v: 'seen', l: 'Già viste' },
  { v: 'unseen', l: 'Non viste' },
  { v: 'wrong', l: 'Sbagliate' },
];

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
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
  const { startQuiz, subjectStats } = useStore();
  const stats = subjectStats(subject.id);
  const cats = useMemo(() => allCategories(subject), [subject]);
  const lessons = useMemo(() => allLessons(subject), [subject]);
  const hasInedite = useMemo(() => subject.questions.some(isInediteQuestion), [subject.questions]);

  const [countSel, setCountSel] = useState<number | 'all' | 'custom'>(20);
  const [customCount, setCustomCount] = useState('');
  const [timerSel, setTimerSel] = useState<number | 'off' | 'custom'>('off');
  const [customTimer, setCustomTimer] = useState('');
  const [selCats, setSelCats] = useState<string[]>(cats);
  const [selLessons, setSelLessons] = useState<number[]>(lessons.map((l) => l.number));
  const [status, setStatus] = useState<StatusFilter>('all');
  const [onlyDates, setOnlyDates] = useState(false);
  const [mode, setMode] = useState<QuizMode>('mixed');
  const [showFilters, setShowFilters] = useState(false);
  const effectiveMode: QuizMode = hasInedite ? mode : 'mixed';

  useEffect(() => {
    setSelCats(cats);
    setSelLessons(lessons.map((l) => l.number));
  }, [cats, lessons]);

  useEffect(() => {
    setMode('mixed');
  }, [subject.id]);

  const pool = useMemo(
    () =>
      filterQuestions(
        subject,
        stats,
        { categories: selCats, lessons: selLessons, status, onlyDates, mode: effectiveMode },
        cats.length,
        lessons.length,
      ),
    [subject, stats, selCats, selLessons, status, onlyDates, effectiveMode, cats.length, lessons.length],
  );

  const requested: number | null =
    countSel === 'all' ? null : countSel === 'custom' ? parseInt(customCount, 10) || 0 : countSel;
  const final = requested === null ? pool.length : Math.min(requested, pool.length);
  const timerMin: number | null =
    timerSel === 'off' ? null : timerSel === 'custom' ? parseInt(customTimer, 10) || 0 : timerSel;

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const start = () => {
    if (countSel === 'custom' && !(requested && requested > 0)) {
      Alert.alert('Quantità non valida', 'Inserisci un numero di domande maggiore di zero.');
      return;
    }
    if (timerSel === 'custom' && !(timerMin && timerMin >= 1)) {
      Alert.alert('Timer non valido', 'Il timer personalizzato deve essere di almeno 1 minuto.');
      return;
    }
    const id = startQuiz(subject.id, {
      count: requested,
      timerMin,
      categories: selCats,
      lessons: selLessons,
      status,
      onlyDates,
      mode: effectiveMode,
    });
    if (!id) {
      Alert.alert('Nessuna domanda', 'Con questi filtri non ci sono domande disponibili.');
      return;
    }
    router.push('/quiz');
  };

  return (
    <Card>
      <H2>Nuova prova</H2>
      {hasInedite && (
        <>
          <Label>Tipo di prova</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip
              label="Misto"
              selected={mode === 'mixed'}
              onPress={() => setMode('mixed')}
              testID="quiz-mode-mixed"
            />
            <Chip
              label="Solo Inedite"
              selected={mode === 'inedite'}
              onPress={() => setMode('inedite')}
              testID="quiz-mode-inedite"
            />
          </View>
          <P color={colors.mutedForeground} style={{ fontSize: 13.5 }}>
            {mode === 'mixed'
              ? `Nel quiz misto, circa il ${INEDITE_QUIZ_PERCENT}% delle domande sarà composto da Inedite, se le categorie selezionate le includono.`
              : 'Solo domande Inedite. Il capitolo filtra quelle indicizzate; le altre restano disponibili.'}
          </P>
        </>
      )}
      <Label>Quantità</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {COUNTS.map((c) => (
          <Chip key={c} label={String(c)} selected={countSel === c} onPress={() => setCountSel(c)} />
        ))}
        <Chip label="Tutte" selected={countSel === 'all'} onPress={() => setCountSel('all')} />
        <Chip label="Altro" selected={countSel === 'custom'} onPress={() => setCountSel('custom')} />
        {countSel === 'custom' && <NumberInput value={customCount} onChange={setCustomCount} placeholder="Domande" />}
      </View>
      <Label>Timer</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Chip label="Nessuno" selected={timerSel === 'off'} onPress={() => setTimerSel('off')} />
        {TIMERS.map((t) => (
          <Chip key={t} label={`${t} min`} selected={timerSel === t} onPress={() => setTimerSel(t)} />
        ))}
        <Chip label="Altro" selected={timerSel === 'custom'} onPress={() => setTimerSel('custom')} />
        {timerSel === 'custom' && <NumberInput value={customTimer} onChange={setCustomTimer} placeholder="Minuti" />}
      </View>
      <Label>Stato delle domande</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {STATUSES.map((s) => (
          <Chip key={s.v} label={s.l} selected={status === s.v} onPress={() => setStatus(s.v)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <P style={{ flex: 1, fontSize: 14.5 }}>Solo domande con date</P>
        <Switch
          value={onlyDates}
          onValueChange={setOnlyDates}
          trackColor={{ false: colors.input, true: colors.accent }}
          thumbColor={onlyDates ? colors.primary : colors.card}
        />
      </View>

      <Btn
        title={showFilters ? 'Nascondi categorie e lezioni' : 'Categorie e lezioni'}
        variant="ghost"
        small
        icon={showFilters ? 'chevron-up' : 'sliders'}
        onPress={() => setShowFilters((v) => !v)}
      />
      {showFilters && (
        <View style={{ gap: 10 }}>
          {mode === 'mixed' && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>Categorie ({selCats.length}/{cats.length})</Label>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Btn title="Tutte" small variant="ghost" onPress={() => setSelCats(cats)} />
                  <Btn title="Nessuna" small variant="ghost" onPress={() => setSelCats([])} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {cats.map((c) => (
                  <Chip key={c} label={c} selected={selCats.includes(c)} onPress={() => toggle(selCats, c, setSelCats)} />
                ))}
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Label>Lezioni ({selLessons.length}/{lessons.length})</Label>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Btn title="Tutte" small variant="ghost" onPress={() => setSelLessons(lessons.map((l) => l.number))} />
              <Btn title="Nessuna" small variant="ghost" onPress={() => setSelLessons([])} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {lessons.map((l) => (
              <View key={l.number} style={{ width: '20%', alignItems: 'center', paddingVertical: 3 }}>
                <Chip
                  label={`L${l.number}`}
                  selected={selLessons.includes(l.number)}
                  onPress={() => toggle(selLessons, l.number, setSelLessons)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
        Disponibili con questi filtri: {pool.length}. La prova avrà {final} {final === 1 ? 'domanda' : 'domande'}.
      </P>
      <Btn title="Avvia prova" icon="play" onPress={start} disabled={pool.length === 0} />
    </Card>
  );
}
