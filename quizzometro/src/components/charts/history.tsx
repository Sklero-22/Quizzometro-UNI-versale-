import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { DailyLearningPoint } from '../../domain/quiz/mastery';
import { localCalendarDay, localMidnightForDay } from '../../domain/quiz/mastery';
import { colors, fonts, radius } from '../../theme';
import { P } from '../ui';

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

export function TrendChart({ points }: { points: DailyLearningPoint[] }) {
  const [width, setWidth] = useState(320);
  const [selected, setSelected] = useState<DailyLearningPoint | null>(null);
  const sorted = useMemo(() => points.slice().sort((a, b) => a.day - b.day), [points]);
  const firstDay = sorted[0]?.day ?? localCalendarDay(Date.now());
  const lastDay = sorted[sorted.length - 1]?.day ?? firstDay;
  const dayCount = Math.max(1, lastDay - firstDay + 1);
  const chartWidth = Math.max(width - 32, Math.min(1600, dayCount * 24));
  const chartHeight = 172;
  const left = 8;
  const right = chartWidth - 8;
  const top = 12;
  const bottom = 130;
  const xForDay = (day: number) => left + (dayCount === 1 ? (right - left) / 2 : ((day - firstDay) / (dayCount - 1)) * (right - left));
  const yForAccuracy = (value: number) => bottom - (Math.max(0, Math.min(100, value)) / 100) * (bottom - top);

  const geometry = useMemo(() => {
    if (!sorted.length) return null;
    const barPath = sorted
      .map((point) => {
        const x = xForDay(point.day);
        const barHeight = Math.max(2, (point.answers / Math.max(1, ...sorted.map((item) => item.answers))) * 26);
        return `M${x - 2} ${bottom}v-${barHeight}h4v${barHeight}Z`;
      })
      .join('');
    // La linea si interrompe quando tra due giorni di studio passano più di 3 giorni:
    // così una pausa lunga non viene disegnata come un periodo di accuratezza costante.
    const segments: (typeof sorted)[] = [];
    sorted.forEach((point, index) => {
      if (index === 0 || point.day - sorted[index - 1].day > 3) segments.push([point]);
      else segments[segments.length - 1].push(point);
    });
    const linePath = segments
      .map((seg) =>
        seg
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${xForDay(point.day)} ${yForAccuracy(point.accuracy)}`)
          .join(' '),
      )
      .join(' ');
    const areaPath = segments
      .filter((seg) => seg.length > 1)
      .map(
        (seg) =>
          seg.map((point, index) => `${index === 0 ? 'M' : 'L'}${xForDay(point.day)} ${yForAccuracy(point.accuracy)}`).join(' ') +
          ` L${xForDay(seg[seg.length - 1].day)} ${bottom} L${xForDay(seg[0].day)} ${bottom} Z`,
      )
      .join(' ');
    return { barPath, linePath, areaPath };
  }, [sorted, chartWidth, bottom, top]);

  const nearestPoint = (x: number) => {
    if (!sorted.length) return;
    const day = firstDay + (dayCount === 1 ? 0 : ((x - left) / (right - left)) * (dayCount - 1));
    const nearest = sorted.reduce((best, point) =>
      Math.abs(point.day - day) < Math.abs(best.day - day) ? point : best,
    );
    setSelected(nearest);
  };

  if (!sorted.length) return <P color={colors.mutedForeground}>Nessuna risposta nel periodo selezionato.</P>;

  return (
    <View onLayout={(event) => setWidth(Math.max(280, event.nativeEvent.layout.width))} style={{ gap: 8 }}>
      {selected && (
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: colors.accentSoft,
            borderRadius: radius.base,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
          testID="trend-chart-tooltip"
        >
          <Text style={{ fontFamily: fonts.bodySemi, color: colors.text, fontSize: 12.5 }}>
            {dateLabel(selected.date)} · {selected.answers} {selected.answers === 1 ? 'risposta' : 'risposte'} · {String(selected.accuracy).replace('.', ',')}%
          </Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={chartWidth > width}>
        <Pressable
          onPress={(event) => nearestPoint(event.nativeEvent.locationX)}
          accessibilityRole="button"
          accessibilityLabel="Tocca il grafico per vedere i dati del giorno"
          style={{ width: chartWidth, height: chartHeight }}
          testID="trend-chart-plot"
        >
          <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
            <Defs>
              <LinearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.masteryLearned} stopOpacity={0.32} />
                <Stop offset="100%" stopColor={colors.masteryLearned} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>
            {[0, 50, 100].map((tick) => {
              const y = yForAccuracy(tick);
              return (
                <React.Fragment key={tick}>
                  <Path d={`M${left} ${y}H${right}`} stroke={colors.border} strokeWidth={1} />
                  <SvgText x={1} y={y + 4} fill={colors.mutedForeground} fontSize={10}>
                    {tick}
                  </SvgText>
                </React.Fragment>
              );
            })}
            {geometry && <Path d={geometry.barPath} fill={colors.accent} opacity={0.8} />}
            {geometry && <Path d={geometry.areaPath} fill="url(#trend-fill)" />}
            {geometry && <Path d={geometry.linePath} fill="none" stroke={colors.masteryLearned} strokeWidth={2.5} />}
            {sorted.map((point) => (
              <Circle
                key={`dot-${point.day}`}
                cx={xForDay(point.day)}
                cy={yForAccuracy(point.accuracy)}
                r={2.6}
                fill={colors.masteryLearned}
              />
            ))}
            {selected && (
              <Circle
                cx={xForDay(selected.day)}
                cy={yForAccuracy(selected.accuracy)}
                r={5}
                fill={colors.card}
                stroke={colors.masteryLearned}
                strokeWidth={3}
              />
            )}
          </Svg>
        </Pressable>
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 11 }}>
          {dateLabel(sorted[0].date)}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 11 }}>
          {dateLabel(sorted[sorted.length - 1].date)}
        </Text>
      </View>
    </View>
  );
}

export function ActivityCalendar({ points }: { points: DailyLearningPoint[] }) {
  const today = localCalendarDay(Date.now());
  const todayDate = new Date(Date.now());
  const daysSinceMonday = (todayDate.getDay() + 6) % 7;
  const startDay = today - daysSinceMonday - 11 * 7;
  const totals = useMemo(() => new Map(points.map((point) => [point.day, point.answers])), [points]);
  const visibleDays = Array.from({ length: 84 }, (_, index) => startDay + index).filter((day) => day <= today);
  const studied = visibleDays.filter((day) => (totals.get(day) ?? 0) > 0);

  let currentStreak = 0;
  for (let day = today; totals.has(day); day--) currentStreak++;
  let record = 0;
  let run = 0;
  for (let offset = 0; offset < 84; offset++) {
    if (totals.has(startDay + offset) && startDay + offset <= today) {
      run++;
      record = Math.max(record, run);
    } else run = 0;
  }
  const maxAnswers = Math.max(1, ...points.map((point) => point.answers));
  const shades = [colors.activity0, colors.activity1, colors.activity2, colors.activity3, colors.activity4];
  const level = (day: number) => {
    const answers = totals.get(day) ?? 0;
    if (!answers) return 0;
    if (answers / maxAnswers > 0.75) return 4;
    if (answers / maxAnswers > 0.5) return 3;
    if (answers / maxAnswers > 0.25) return 2;
    return 1;
  };

  return (
    <View style={{ gap: 10 }} testID="activity-calendar">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 3 }}>
        {Array.from({ length: 12 }, (_, week) => (
          <View key={week} style={{ gap: 4 }}>
            {Array.from({ length: 7 }, (_, weekday) => {
              const day = startDay + week * 7 + weekday;
              const active = day <= today;
              return (
                <View
                  key={weekday}
                  accessibilityLabel={
                    active
                      ? `${new Date(localMidnightForDay(day)).toLocaleDateString('it-IT')}: ${totals.get(day) ?? 0} risposte`
                      : undefined
                  }
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: active ? shades[level(day)] : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? colors.border : 'transparent',
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text style={{ fontFamily: fonts.body, color: colors.mutedForeground, fontSize: 11 }}>Poche</Text>
        {shades.map((shade, index) => (
          <View key={index} style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: shade }} />
        ))}
        <Text style={{ fontFamily: fonts.body, color: colors.mutedForeground, fontSize: 11 }}>Molte</Text>
      </View>
      <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
        Giorni di studio: {studied.length} · Serie attuale: {currentStreak} {currentStreak === 1 ? 'giorno' : 'giorni'} · Record: {record} {record === 1 ? 'giorno' : 'giorni'}
      </P>
    </View>
  );
}

export function RecoveryGauge({
  recovered,
  wrong,
  percentage,
}: {
  recovered: number;
  wrong: number;
  percentage: number;
}) {
  const size = 220;
  const centerX = size / 2;
  const centerY = 124;
  const radiusValue = 78;
  const progress = Math.max(0, Math.min(100, percentage)) / 100;
  const angle = Math.PI + Math.PI * progress;
  const endX = centerX + radiusValue * Math.cos(angle);
  const endY = centerY + radiusValue * Math.sin(angle);
  const arcPath = `M${centerX - radiusValue} ${centerY} A${radiusValue} ${radiusValue} 0 0 1 ${endX} ${endY}`;
  const trackPath = `M${centerX - radiusValue} ${centerY} A${radiusValue} ${radiusValue} 0 0 1 ${centerX + radiusValue} ${centerY}`;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Recupero ${percentage} percento. Recuperate ${recovered} su ${wrong} domande sbagliate almeno una volta.`}
      style={{ alignItems: 'center', justifyContent: 'center' }}
      testID="recovery-gauge"
    >
      <Svg width={size} height={140} viewBox={`0 0 ${size} 140`}>
        <Path d={trackPath} fill="none" stroke={colors.muted} strokeWidth={16} strokeLinecap="round" />
        {progress > 0 && (
          <Path
            d={arcPath}
            fill="none"
            stroke={colors.masteryLearned}
            strokeWidth={16}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <View style={{ position: 'absolute', top: 58, alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontFamily: fonts.bodyBold, fontSize: 28 }}>{percentage}%</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.bodyMedium, fontSize: 12 }}>recupero</Text>
      </View>
      <Text
        style={{
          marginTop: 2,
          textAlign: 'center',
          color: colors.mutedForeground,
          fontFamily: fonts.bodyMedium,
          fontSize: 12.5,
        }}
      >
        Recuperate {recovered} su {wrong} sbagliate almeno una volta
      </Text>
    </View>
  );
}
