import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { MasteryDistribution, MasteryState } from '../../domain/quiz/mastery';
import type { Question } from '../../domain/types';
import { Btn, H2, P } from '../ui';
import { colors, fonts, radius } from '../../theme';

const STATE_ORDER: MasteryState[] = ['new', 'recover', 'consolidating', 'learned', 'review'];
const STATE_COLORS: Record<MasteryState, string> = {
  new: colors.masteryNew,
  recover: colors.masteryRecover,
  consolidating: colors.masteryConsolidating,
  learned: colors.masteryLearned,
  review: colors.masteryReview,
};
const STATE_LABELS: Record<MasteryState, string> = {
  new: 'Nuova',
  recover: 'Da recuperare',
  consolidating: 'In consolidamento',
  learned: 'Imparata',
  review: 'Da ripassare',
};

export function masteryColor(state: MasteryState): string {
  return STATE_COLORS[state];
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function AnimatedSegment({
  size,
  strokeWidth,
  start,
  length,
  circumference,
  color,
  progress,
}: {
  size: number;
  strokeWidth: number;
  start: number;
  length: number;
  circumference: number;
  color: string;
  progress: ReturnType<typeof useSharedValue<number>>;
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0.001, length * progress.value), circumference],
  }));
  return (
    <AnimatedCircle
      cx={size / 2}
      cy={size / 2}
      r={(size - strokeWidth) / 2}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="butt"
      strokeDashoffset={-start}
      rotation={-90}
      originX={size / 2}
      originY={size / 2}
      animatedProps={animatedProps}
    />
  );
}

export function MasteryRing({
  distribution,
  size = 180,
  dark = false,
}: {
  distribution: MasteryDistribution;
  size?: 64 | 180;
  dark?: boolean;
}) {
  const progress = useSharedValue(0);
  const strokeWidth = size === 64 ? 8 : 16;
  const radiusValue = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  let offset = 0;

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(1, { duration: 600 });
    return () => cancelAnimation(progress);
  }, [distribution, progress]);

  const segments = STATE_ORDER.flatMap((state) => {
    const count = distribution.counts[state];
    if (!count || !distribution.total) return [];
    const length = (count / distribution.total) * circumference;
    const segment = { state, length, start: offset };
    offset += length;
    return [segment];
  });

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Domande imparate ${distribution.learnedPercent} percento; ${STATE_ORDER.map(
        (state) => `${STATE_LABELS[state]} ${distribution.counts[state]}`,
      ).join(', ')}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      testID={`mastery-ring-${size}`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          fill="none"
          stroke={dark ? colors.inkSoft : colors.muted}
          opacity={dark ? 0.3 : 1}
          strokeWidth={strokeWidth}
        />
        {segments.map(({ state, length, start }) => (
          <AnimatedSegment
            key={state}
            size={size}
            strokeWidth={strokeWidth}
            start={start}
            length={length}
            circumference={circumference}
            color={STATE_COLORS[state]}
            progress={progress}
          />
        ))}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text
          style={{
            color: dark ? colors.secondaryForeground : colors.text,
            fontFamily: fonts.bodyBold,
            fontSize: size === 64 ? 12 : 30,
            lineHeight: size === 64 ? 15 : 34,
          }}
        >
          {distribution.learnedPercent}%
        </Text>
        <Text
          style={{
            color: dark ? colors.inkSoft : colors.mutedForeground,
            fontFamily: fonts.bodyMedium,
            fontSize: size === 64 ? 8 : 12,
          }}
        >
          imparate
        </Text>
      </View>
    </View>
  );
}

export function MasteryBar({
  counts,
  total,
  height = 8,
}: {
  counts: Record<MasteryState, number>;
  total?: number;
  height?: number;
}) {
  const countTotal = total ?? STATE_ORDER.reduce((sum, state) => sum + counts[state], 0);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={STATE_ORDER.map((state) => `${STATE_LABELS[state]} ${counts[state]}`).join(', ')}
      style={{ height, flexDirection: 'row', overflow: 'hidden', borderRadius: height / 2, backgroundColor: colors.muted }}
      testID="mastery-bar"
    >
      {countTotal > 0 &&
        STATE_ORDER.filter((state) => counts[state] > 0).map((state) => (
          <View
            key={state}
            style={{
              flexGrow: counts[state],
              flexBasis: 0,
              minWidth: counts[state] / countTotal < 0.02 ? 3 : 0,
              backgroundColor: STATE_COLORS[state],
            }}
          />
        ))}
    </View>
  );
}

export function LegendChips({
  questions,
  distribution,
  onTrain,
  compact = false,
}: {
  questions: Question[];
  distribution: MasteryDistribution;
  onTrain: (questionIds: string[], state: MasteryState) => void;
  compact?: boolean;
}) {
  const [selected, setSelected] = React.useState<MasteryState | null>(null);
  const selectedQuestions = selected
    ? questions.filter((question) => distribution.statesById[question.id] === selected)
    : [];

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: compact ? 5 : 7 }}>
        {STATE_ORDER.map((state) => (
          <Pressable
            key={state}
            onPress={() => setSelected(state)}
            accessibilityRole="button"
            accessibilityLabel={`${STATE_LABELS[state]}: ${distribution.counts[state]} domande`}
            testID={`mastery-legend-${state}`}
            style={({ pressed }) => ({
              minHeight: 30,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: compact ? 7 : 9,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATE_COLORS[state] }} />
            <Text style={{ fontFamily: fonts.bodyMedium, color: colors.text, fontSize: compact ? 11 : 12 }}>
              {STATE_LABELS[state]} {distribution.counts[state]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 20,
            backgroundColor: 'rgba(20, 22, 34, 0.48)',
          }}
        >
          <View
            style={{
              maxHeight: '82%',
              backgroundColor: colors.background,
              borderRadius: radius.card,
              padding: 18,
              gap: 12,
            }}
          >
            <H2>{selected ? STATE_LABELS[selected] : 'Domande'}</H2>
            {selectedQuestions.length ? (
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
                {selectedQuestions.map((question) => (
                  <View key={question.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 }}>
                    <P numberOfLines={3}>{question.q}</P>
                    <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 12, marginTop: 3 }}>
                      {question.lz ? `Lezione ${question.lz}` : 'Senza lezione'}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <P color={colors.mutedForeground}>Nessuna domanda in questo stato.</P>
            )}
            {selected && selectedQuestions.length > 0 && (
              <Btn
                title="Allenati su queste"
                icon="play"
                onPress={() => {
                  const state = selected;
                  const ids = selectedQuestions.map((question) => question.id);
                  setSelected(null);
                  onTrain(ids, state);
                }}
                testID="mastery-train-selected"
              />
            )}
            <Btn title="Chiudi" variant="ghost" onPress={() => setSelected(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
