import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Card, Empty, H2, Label, P, Screen } from '../src/components/ui';
import { useStore } from '../src/data/store';
import type { Question, Subject } from '../src/domain/types';
import { colors, fonts } from '../src/theme';

interface SavedGroup {
  subject: Subject;
  questions: Question[];
}

export default function Bookmarks() {
  const router = useRouter();
  const { data, startFromQids, toggleSavedQuestion } = useStore();

  const groups = useMemo(
    () =>
      data.subjects
        .map((subject) => {
          const savedIds = new Set(data.savedQuestionIds[subject.id] ?? []);
          return { subject, questions: subject.questions.filter((question) => savedIds.has(question.id)) };
        })
        .filter((group) => group.questions.length > 0),
    [data.subjects, data.savedQuestionIds],
  );

  const startReview = (group: SavedGroup) => {
    const id = startFromQids({
      subjectId: group.subject.id,
      qids: group.questions.map((question) => question.id),
      kind: 'review',
      label: 'Domande salvate',
      keepOrder: false,
    });
    if (id) router.push('/quiz');
  };

  return (
    <Screen title="Domande salvate" onBack={() => router.back()}>
      {groups.length === 0 ? (
        <Empty
          title="Nessuna domanda salvata"
          text="Durante un quiz o nella revisione, tocca il segnalibro per ritrovare qui le domande da ripassare."
        />
      ) : (
        groups.map((group) => (
          <Card key={group.subject.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <H2>{group.subject.title}</H2>
                <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
                  {group.questions.length} {group.questions.length === 1 ? 'domanda salvata' : 'domande salvate'}
                </P>
              </View>
              <Btn title="Ripassa" icon="play" small onPress={() => startReview(group)} />
            </View>

            {group.questions.map((question) => (
              <View
                key={question.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  paddingTop: 12,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Label>
                    {question.tit
                      ? `Lezione ${question.lz} · ${question.tit}`
                      : question.lz
                        ? `Lezione ${question.lz}`
                        : 'Domanda'}
                  </Label>
                  <P style={{ fontFamily: fonts.bodyMedium, fontSize: 14.5 }}>{question.q}</P>
                </View>
                <Pressable
                  onPress={() => toggleSavedQuestion(group.subject.id, question.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi dai salvati"
                  testID={`remove-saved-question-${question.id}`}
                  style={{ padding: 4 }}
                >
                  <Feather name="bookmark" size={20} color={colors.primary} fill={colors.primary} />
                </Pressable>
              </View>
            ))}
          </Card>
        ))
      )}
    </Screen>
  );
}
