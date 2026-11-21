import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Bar, Btn, Card, Chip, Empty, H2, Label, P, Screen } from '../src/components/ui';
import { useStore } from '../src/data/store';
import {
  lessonProgress,
  questionCategories,
  scoreSession,
  subjectSummary,
} from '../src/domain/quiz/engine';
import { colors, fonts } from '../src/theme';

const KIND: Record<string, string> = { original: 'Prova', review: 'Ripasso', repeat: 'Ripetizione' };
const pct = (n: number) => String(n).replace('.', ',') + '%';

export default function Stats() {
  const router = useRouter();
  const { data, activeSubject, setActiveSubject, subjectStats, resetProgress } = useStore();
  const subject = activeSubject;
  const stats = subject ? subjectStats(subject.id) : {};

  const calc = useMemo(() => {
    if (!subject) return null;
    const sum = subjectSummary(subject, stats);
    const cats = new Map<string, { met: number; total: number }>();
    const lessons = lessonProgress(subject, stats);
    subject.questions.forEach((q) => {
      const st = stats[q.id];
      questionCategories(q).forEach((c) => {
        const e = cats.get(c) ?? { met: 0, total: 0 };
        e.total++;
        if (st && st.seen > 0) e.met++;
        cats.set(c, e);
      });
    });
    const weak = lessons
      .filter((lesson) => lesson.answeredAttempts >= 2)
      .map((lesson) => ({
        n: lesson.number,
        title: lesson.title,
        acc: lesson.correctAnswers / lesson.answeredAttempts,
        tot: lesson.answeredAttempts,
      }))
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 6);
    const hard = subject.questions
      .filter((q) => (stats[q.id]?.wrong ?? 0) > 0)
      .sort((a, b) => stats[b.id].wrong - stats[a.id].wrong)
      .slice(0, 8);
    const finished = data.sessions
      .filter((s) => s.subjectId === subject.id && s.finishedAt !== null)
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
    const originals = finished.filter((s) => s.kind === 'original').length;
    return { sum, cats, lessons, weak, hard, last: finished.slice(0, 10), originals };
  }, [subject, stats, data.sessions]);

  if (!subject || !calc) {
    return (
      <Screen title="Statistiche" onBack={() => router.back()}>
        <Empty title="Nessuna materia" text="Importa una materia per vedere le statistiche." />
      </Screen>
    );
  }
  const byId = new Map(subject.questions.map((q) => [q.id, q]));
  const { sum } = calc;

  const reset = () =>
    Alert.alert(
      'Azzerare i progressi?',
      `Statistiche e cronologia di "${subject.title}" verranno eliminate in modo irreversibile. Le domande restano.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Azzera', style: 'destructive', onPress: () => resetProgress(subject.id) },
      ],
    );

  return (
    <Screen title="Statistiche" onBack={() => router.back()}>
      {data.subjects.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {data.subjects.map((s) => (
            <Chip key={s.id} label={s.title} selected={s.id === subject.id} onPress={() => setActiveSubject(s.id)} />
          ))}
        </View>
      )}
      <Card tone="ink">
        <Label color={colors.accent}>{subject.title}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
          <Big label="Risposte" value={String(sum.totalAnswers)} />
          <Big label="Accuratezza" value={sum.accuracy === null ? '–' : pct(sum.accuracy)} />
          <Big label="Incontrate" value={`${sum.met}/${sum.total}`} />
          <Big label="Prove" value={String(calc.originals)} />
        </View>
      </Card>

      <Card>
        <H2>Copertura per categoria</H2>
        {[...calc.cats.entries()].map(([c, e]) => (
          <View key={c} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <P style={{ fontFamily: fonts.bodySemi, fontSize: 14.5 }}>{c}</P>
              <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
                {e.met}/{e.total}
              </P>
            </View>
            <Bar value={e.total ? e.met / e.total : 0} color={colors.success} />
          </View>
        ))}
      </Card>

      <Card>
        <H2>Progressi per capitolo</H2>
        <P color={colors.mutedForeground} style={{ fontSize: 13.5 }}>
          Domande affrontate sul totale; accuratezza calcolata solo sulle risposte date.
        </P>
        {calc.lessons.map((lesson) => (
          <View key={lesson.number} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <P style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: 14.5 }} numberOfLines={2}>
                <Text style={{ fontFamily: fonts.bodyBold }}>L{lesson.number}</Text>
                {lesson.title ? ` · ${lesson.title}` : ''}
              </P>
              <P
                color={lesson.accuracyPct === null ? colors.mutedForeground : colors.text}
                style={{ fontFamily: fonts.bodyBold, fontSize: 13.5, textAlign: 'right' }}
              >
                {lesson.totalQuestions === 0
                  ? 'Nessuna domanda'
                  : lesson.accuracyPct === null
                    ? 'Non iniziato'
                    : `${pct(lesson.accuracyPct)} corrette`}
              </P>
            </View>
            {lesson.totalQuestions === 0 ? (
              <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                Nessuna domanda associata a questo capitolo.
              </P>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                    {lesson.seenQuestions}/{lesson.totalQuestions} domande affrontate
                  </P>
                  {lesson.answeredAttempts > 0 && (
                    <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                      {lesson.correctAnswers}/{lesson.answeredAttempts} risposte
                    </P>
                  )}
                </View>
                <Bar value={lesson.seenQuestions / lesson.totalQuestions} color={colors.success} height={6} />
              </>
            )}
          </View>
        ))}
      </Card>

      <Card>
        <H2>Lezioni da rinforzare</H2>
        {calc.weak.length === 0 ? (
          <P color={colors.mutedForeground}>Servono almeno 2 risposte per lezione.</P>
        ) : (
          calc.weak.map((w) => (
            <View key={w.n} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <P style={{ flex: 1, fontSize: 14.5 }} numberOfLines={2}>
                  <Text style={{ fontFamily: fonts.bodyBold }}>L{w.n}</Text>
                  {w.title ? ` · ${w.title}` : ''}
                </P>
                <P style={{ fontFamily: fonts.bodyBold, fontSize: 14.5 }} color={colors.destructive}>
                  {pct(Math.round(w.acc * 1000) / 10)}
                </P>
              </View>
              <Bar value={w.acc} color={colors.destructive} height={6} />
            </View>
          ))
        )}
      </Card>

      <Card>
        <H2>Domande più difficili</H2>
        {calc.hard.length === 0 ? (
          <P color={colors.mutedForeground}>Nessun errore registrato finora.</P>
        ) : (
          calc.hard.map((q) => (
            <View key={q.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.destructive }}>
                  {stats[q.id].wrong}×
                </Text>
              </View>
              <P style={{ flex: 1, fontSize: 14.5 }} numberOfLines={3}>
                {q.q}
              </P>
            </View>
          ))
        )}
      </Card>

      <Card>
        <H2>Ultime sessioni</H2>
        {calc.last.length === 0 ? (
          <P color={colors.mutedForeground}>Nessuna sessione conclusa.</P>
        ) : (
          calc.last.map((s) => {
            const sc = scoreSession(s, byId);
            const d = new Date(s.finishedAt ?? s.startedAt);
            return (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: '/results', params: { id: s.id } })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <P style={{ fontFamily: fonts.bodySemi, fontSize: 14.5 }}>
                    {KIND[s.kind]}
                    {s.endReason === 'partial' ? ' · parziale' : s.endReason === 'timeout' ? ' · scaduta' : ''}
                  </P>
                  <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                    {d.toLocaleDateString('it-IT')} {d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                  </P>
                </View>
                <P style={{ fontFamily: fonts.bodyBold }}>
                  {sc.correct}/{sc.total} · {pct(sc.pct)}
                </P>
              </Pressable>
            );
          })
        )}
      </Card>

      <Btn title="Azzera i progressi di questa materia" variant="danger" icon="trash-2" onPress={reset} />
    </Screen>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 26, color: colors.secondaryForeground }}>{value}</Text>
      <Label color={colors.inkSoft}>{label}</Label>
    </View>
  );
}
