import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Btn, Card, Chip, Empty, H2, Label, P, Screen } from '../src/components/ui';
import { useLayout } from '../src/components/layout';
import { useStore } from '../src/data/store';
import { scoreSession } from '../src/domain/quiz/engine';
import { lessonLabel, sourceLabel } from '../src/domain/quiz/sourceLabel';
import { colors, fonts } from '../src/theme';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const KIND: Record<string, string> = { original: 'Prova', review: 'Ripasso', repeat: 'Ripetizione' };

export default function Results() {
  const router = useRouter();
  const { isWide } = useLayout();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, startFromQids, toggleSavedQuestion } = useStore();
  const [filter, setFilter] = useState<'all' | 'wrong' | 'blank'>('all');

  const session = data.sessions.find((s) => s.id === id);
  const subject = data.subjects.find((s) => s.id === session?.subjectId);
  const byId = useMemo(() => new Map((subject?.questions ?? []).map((q) => [q.id, q])), [subject]);

  if (!session || !subject) {
    return (
      <Screen title="Risultato" onBack={() => router.replace('/')}>
        <Empty title="Prova non trovata" text="Potrebbe essere stata eliminata insieme alla materia." />
        <Btn title="Torna alla Home" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const score = scoreSession(session, byId);
  const savedQuestionIds = new Set(data.savedQuestionIds[subject.id] ?? []);
  const rows = session.items.map((it, i) => {
    const q = byId.get(it.qid);
    const a = session.answers[i];
    const state: 'ok' | 'wrong' | 'blank' = !q || a === null ? 'blank' : a === q.ci ? 'ok' : 'wrong';
    return { it, i, q, a, state };
  });
  const shown = rows.filter((r) => filter === 'all' || r.state === filter);
  const wrongQids = rows.filter((r) => r.state !== 'ok' && r.q).map((r) => r.it.qid);

  const repeat = (qids: string[], label: string) => {
    const nid = startFromQids({
      subjectId: subject.id,
      qids,
      kind: 'repeat',
      label,
      keepOrder: false,
      sourceSessionId: session.id,
    });
    if (nid) router.replace('/quiz');
  };

  const tone = score.pct >= 60 ? 'success' : score.pct >= 40 ? 'accent' : 'danger';
  const reason =
    session.endReason === 'timeout' ? 'Tempo scaduto' : session.endReason === 'partial' ? 'Prova parziale' : null;

  return (
    <Screen title="Risultato" onBack={() => router.replace('/')}>
      <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={isWide ? { flex: 0.8, minWidth: 0, gap: 14 } : { width: '100%', gap: 14 }}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Card tone={tone}>
          <Label>
            {KIND[session.kind]} · {subject.title}
          </Label>
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 52, color: colors.text, lineHeight: 58 }}>
            {String(score.pct).replace('.', ',')}%
          </Text>
          {reason && <P color={colors.destructive} style={{ fontFamily: fonts.bodySemi }}>{reason}</P>}
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            <Stat label="Corrette" value={score.correct} color={colors.success} />
            <Stat label="Sbagliate" value={score.wrong} color={colors.destructive} />
            <Stat label="Non date" value={score.blank} color={colors.mutedForeground} />
            <Stat label="Totale" value={score.total} color={colors.text} />
          </View>
        </Card>
      </Animated.View>

      <Btn title="Nuova prova" icon="play" onPress={() => router.replace('/')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn
          title="Ripeti errori"
          variant="ink"
          icon="rotate-ccw"
          style={{ flex: 1 }}
          disabled={!wrongQids.length}
          onPress={() => repeat(wrongQids, 'Ripetizione errori')}
        />
        <Btn
          title="Ripeti tutto"
          variant="ghost"
          icon="repeat"
          style={{ flex: 1 }}
          onPress={() => repeat(session.items.map((x) => x.qid), 'Ripetizione completa')}
        />
      </View>

        </View>
        <View style={isWide ? { flex: 1.2, minWidth: 0, gap: 14 } : { width: '100%', gap: 14 }}>
      <H2>Revisione</H2>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label={`Tutte (${rows.length})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={`Sbagliate (${score.wrong})`} selected={filter === 'wrong'} onPress={() => setFilter('wrong')} />
        <Chip label={`Non date (${score.blank})`} selected={filter === 'blank'} onPress={() => setFilter('blank')} />
      </View>
      {shown.length === 0 && <Empty title="Nessuna domanda in questo elenco" />}
      {shown.map(({ it, i, q, a, state }) => (
        <Card key={it.qid + i} tone={state === 'ok' ? 'success' : state === 'wrong' ? 'danger' : 'plain'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather
                name={state === 'ok' ? 'check-circle' : state === 'wrong' ? 'x-circle' : 'minus-circle'}
                size={18}
                color={state === 'ok' ? colors.success : state === 'wrong' ? colors.destructive : colors.mutedForeground}
              />
              <Label>Domanda {i + 1}</Label>
            </View>
            {q && (
              <Pressable
                onPress={() => toggleSavedQuestion(subject.id, q.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={savedQuestionIds.has(q.id) ? 'Rimuovi dai salvati' : 'Salva per dopo'}
                testID={`toggle-saved-question-${q.id}`}
              >
                <Feather
                  name="bookmark"
                  size={18}
                  color={savedQuestionIds.has(q.id) ? colors.primary : colors.mutedForeground}
                  fill={savedQuestionIds.has(q.id) ? colors.primary : 'transparent'}
                />
              </Pressable>
            )}
          </View>
          {q && (sourceLabel(q) || lessonLabel(q)) ? (
            <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
              {[sourceLabel(q), lessonLabel(q)].filter(Boolean).join(' — ')}
            </P>
          ) : null}
          <P style={{ fontFamily: fonts.bodyMedium }}>{q ? q.q : 'Domanda non più disponibile'}</P>
          {q && (
            <>
              {a !== null && state === 'wrong' && (
                <P color={colors.destructive} style={{ fontSize: 14.5 }}>
                  La tua risposta: {LETTERS[it.order.indexOf(a)]}. {q.opts[a]}
                </P>
              )}
              <P color={colors.success} style={{ fontSize: 14.5, fontFamily: fonts.bodySemi }}>
                Risposta corretta: {LETTERS[it.order.indexOf(q.ci)]}. {q.opts[q.ci]}
              </P>
              {q.exp ? <P color={colors.mutedForeground} style={{ fontSize: 14 }}>{q.exp}</P> : null}
            </>
          )}
        </Card>
      ))}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 24, color }}>{value}</Text>
      <Label>{label}</Label>
    </View>
  );
}
