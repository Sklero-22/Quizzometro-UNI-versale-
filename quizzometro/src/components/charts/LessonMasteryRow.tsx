import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MasteryDistribution } from '../../domain/quiz/mastery';
import { MasteryBar } from './mastery';
import { colors, fonts } from '../../theme';

export function LessonMasteryRow({
  number,
  title,
  distribution,
  onPress,
}: {
  number: number;
  title: string;
  distribution: MasteryDistribution;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Lezione ${number}, ${title}, ${distribution.learnedPercent}% imparate`}
      testID={`lesson-mastery-${number}`}
      style={({ pressed }) => ({ gap: 5, paddingVertical: 8, opacity: pressed ? 0.72 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text
          numberOfLines={2}
          style={{ flex: 1, color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14 }}
        >
          L{number}{title ? ` · ${title}` : ''}
        </Text>
        <Text style={{ color: colors.masteryLearned, fontFamily: fonts.bodyBold, fontSize: 13 }}>
          {distribution.learnedPercent}% imparate
        </Text>
      </View>
      <MasteryBar counts={distribution.counts} total={distribution.total} height={6} />
    </Pressable>
  );
}
