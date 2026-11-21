import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useLayout } from '../src/components/layout';
import { Bar, Btn, Card, H2, Label, P } from '../src/components/ui';
import { useStore } from '../src/data/store';
import { lessonLabel, sourceLabel } from '../src/domain/quiz/sourceLabel';
import { colors, fonts, radius } from '../src/theme';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const safeHaptic = (fn: () => Promise<void>) => {
  try {
    void fn().catch(() => undefined);
  } catch {
    // dispositivo senza feedback aptico
  }
};

export default function QuizScreen() {
  const router = useRouter();
  const { isWide, width, height, pad, compactLandscape } = useLayout();
  const { activeSession: session, data, answer, goTo, finish, toggleSavedQuestion } = useStore();
  const [now, setNow] = useState(Date.now());

  const subject = data.subjects.find((s) => s.id === session?.subjectId);
  const byId = useMemo(() => new Map((subject?.questions ?? []).map((q) => [q.id, q])), [subject]);

  // Evita che, chiusa la prova, il controllo "nessuna prova attiva" riporti alla Home invece che al resoconto.
  const ending = useRef(false);
  const end = useCallback(
    (reason: 'completed' | 'partial' | 'timeout') => {
      if (ending.current) return;
      ending.current = true;
      const id = finish(reason);
      if (id) router.replace({ pathname: '/results', params: { id } });
      else router.replace('/');
    },
    [finish, router],
  );

  useEffect(() => {
    if (!session && !ending.current) router.replace('/');
  }, [session, router]);

  useEffect(() => {
    if (!session?.deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.deadline]);

  useEffect(() => {
    if (session?.deadline && now >= session.deadline) end('timeout');
  }, [now, session?.deadline, end]);

  const leave = useCallback(() => {
    Alert.alert('Uscire dalla prova?', 'La prova resta in sospeso e potrai riprenderla dalla Home.', [
      { text: 'Continua', style: 'cancel' },
      { text: 'Esci', onPress: () => router.replace('/') },
    ]);
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  if (!session || !subject) return null;
  const i = Math.min(session.current, session.items.length - 1);
  const item = session.items[i];
  const q = byId.get(item.qid);
  const n = session.items.length;
  const answered = session.answers.filter((a) => a !== null).length;
  const chosen = session.answers[i];
  const done = chosen !== null && chosen !== undefined;
  const isSaved = !!q && (data.savedQuestionIds[subject.id] ?? []).includes(q.id);

  const tryFinish = () => {
    const blanks = n - answered;
    if (blanks > 0) {
      Alert.alert('Concludere la prova?', `Ci sono ${blanks} domande senza risposta: conteranno come non date.`, [
        { text: 'Torna alla prova', style: 'cancel' },
        { text: 'Concludi', style: 'destructive', onPress: () => end('completed') },
      ]);
    } else end('completed');
  };

  const pick = (orig: number) => {
    if (done || !q) return;
    answer(i, orig);
    if (orig === q.ci) safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    else safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  };

  const sideBySide = isWide && width > height;
  const remaining = session.deadline ? session.deadline - now : null;
  const low = remaining !== null && remaining < 60_000;

  const questionBlock = (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Label style={{ flex: 1 }}>
          {q?.tit ? `Lezione ${q.lz} · ${q.tit}` : q?.lz ? `Lezione ${q.lz}` : 'Domanda'}
        </Label>
        {q && (
          <Pressable
            onPress={() => toggleSavedQuestion(subject.id, q.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isSaved ? 'Rimuovi dai salvati' : 'Salva per dopo'}
            testID="toggle-saved-question"
          >
            <Feather
              name="bookmark"
              size={20}
              color={isSaved ? colors.primary : colors.mutedForeground}
              fill={isSaved ? colors.primary : 'transparent'}
            />
          </Pressable>
        )}
      </View>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 17.5, lineHeight: 25, color: colors.text }}>
        {q ? q.q : 'Questa domanda non è più disponibile.'}
      </Text>
    </Card>
  );

  const optionsBlock = q ? (
    <View style={{ gap: 10 }}>
      {item.order.map((orig, pos) => {
        const isCorrect = orig === q.ci;
        const isChosen = chosen === orig;
        let bg: string = colors.card;
        let border: string = colors.border;
        if (done && isCorrect) {
          bg = colors.successSoft;
          border = colors.success;
        } else if (done && isChosen) {
          bg = colors.dangerSoft;
          border = colors.destructive;
        }
        return (
          <Pressable
            key={orig}
            onPress={() => pick(orig)}
            disabled={done}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 12,
              alignItems: 'flex-start',
              backgroundColor: bg,
              borderColor: border,
              borderWidth: 1.5,
              borderRadius: radius.card,
              padding: 14,
              opacity: pressed && !done ? 0.75 : 1,
            })}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: done && isCorrect ? colors.success : done && isChosen ? colors.destructive : colors.muted,
              }}
            >
              {done && isCorrect ? (
                <Feather name="check" size={16} color="#fff" />
              ) : done && isChosen ? (
                <Feather name="x" size={16} color="#fff" />
              ) : (
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: colors.text }}>{LETTERS[pos]}</Text>
              )}
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: colors.text }}>
              {q.opts[orig]}
            </Text>
          </Pressable>
        );
      })}
      {done ? (
        <Card tone="accent">
          {sourceLabel(q) || lessonLabel(q) ? (
            <View style={{ gap: 2 }}>
              {sourceLabel(q) ? (
                <Label color={colors.accentForeground}>Fonte: {sourceLabel(q)}</Label>
              ) : null}
              {lessonLabel(q) ? (
                <P style={{ fontSize: 13.5, fontFamily: fonts.bodySemi }} color={colors.mutedForeground}>
                  {lessonLabel(q)}
                </P>
              ) : null}
            </View>
          ) : null}
          {q.exp ? (
            <>
              <Label color={colors.accentForeground}>Spiegazione</Label>
              <P style={{ fontSize: 15 }}>{q.exp}</P>
            </>
          ) : null}
        </Card>
      ) : null}
    </View>
  ) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <View
        style={{
          width: '100%',
          maxWidth: sideBySide ? 1180 : 760,
          alignSelf: 'center',
          paddingHorizontal: pad,
          paddingTop: compactLandscape ? 4 : 10,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={leave}
            hitSlop={10}
            accessibilityLabel="Esci dalla prova"
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="x" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.text }}>
              Domanda {i + 1} di {n}
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: colors.mutedForeground }}>
              Risposte date: {answered}
            </Text>
          </View>
          {remaining !== null && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: low ? colors.dangerSoft : colors.inkSoft,
              }}
            >
              <Feather name="clock" size={14} color={low ? colors.destructive : colors.text} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: low ? colors.destructive : colors.text }}>
                {fmt(remaining)}
              </Text>
            </View>
          )}
          <Btn title="Termina" small variant="ghost" onPress={tryFinish} />
        </View>
        <Bar value={(i + 1) / n} height={6} />
      </View>

      <ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: sideBySide ? 1180 : 760,
          alignSelf: 'center',
          padding: pad,
          paddingBottom: 24,
        }}
      >
        <Animated.View key={`${session.id}-${i}`} entering={FadeInDown.duration(220)}>
          {sideBySide ? (
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>{questionBlock}</View>
              <View style={{ flex: 1 }}>{optionsBlock}</View>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {questionBlock}
              {optionsBlock}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View
        style={{
          width: '100%',
          maxWidth: sideBySide ? 1180 : 760,
          alignSelf: 'center',
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: pad,
          paddingBottom: 12,
          paddingTop: 6,
        }}
      >
        <Btn
          title="Indietro"
          variant="ghost"
          icon="arrow-left"
          style={{ flex: 1 }}
          disabled={i === 0}
          onPress={() => goTo(i - 1)}
        />
        {i < n - 1 ? (
          <Btn
            title={done ? 'Avanti' : 'Salta'}
            variant={done ? 'primary' : 'ink'}
            icon="arrow-right"
            style={{ flex: 1 }}
            onPress={() => goTo(i + 1)}
          />
        ) : (
          <Btn title="Concludi" variant="primary" icon="flag" style={{ flex: 1 }} onPress={tryFinish} />
        )}
      </View>
    </SafeAreaView>
  );
}
