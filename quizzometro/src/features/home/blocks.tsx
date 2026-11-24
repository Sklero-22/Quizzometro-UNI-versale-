import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Bar, Btn, Card, H2, Label, P } from '../../components/ui';
import { useLayout } from '../../components/layout';
import { LegendChips, MasteryRing } from '../../components/charts';
import { useStore } from '../../data/store';
import { useInstall } from '../../data/useInstall';
import { UPDATE_ACTION_LABEL } from '../../data/releases';
import { UpdateInstructionsModal } from '../../components/UpdateInstructionsModal';
import { MASTERY_LABELS, summarizeMastery, type MasteryState } from '../../domain/quiz/mastery';
import {
  answeredQidsSince,
  lastOriginalTests,
  qidsOfSessions,
  startOfToday,
  subjectSummary,
} from '../../domain/quiz/engine';
import type { ReleaseInfo, Session, Subject } from '../../domain/types';
import { colors, fonts, radius } from '../../theme';

export function SubjectPanel({ subject }: { subject: Subject }) {
  const router = useRouter();
  const { subjectStats, data, startFromQids } = useStore();
  const stats = subjectStats(subject.id);
  const sum = subjectSummary(subject, stats);
  const mastery = useMemo(() => summarizeMastery(subject.questions, stats), [subject.questions, stats]);
  return (
    <Card tone="ink">
      <Pressable
        onPress={() => router.push('/progress')}
        accessibilityRole="button"
        accessibilityLabel={`Andamento di ${subject.title}. ${mastery.learnedPercent}% imparate, ${mastery.counts.recover} da recuperare`}
        testID="home-subject-mastery"
        style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.78 : 1 })}
      >
        <Label color={colors.accent}>Materia attiva</Label>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 24, lineHeight: 29, color: colors.secondaryForeground }}>
          {subject.title}
        </Text>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft }}>
          {sum.total} domande · {(subject.lessons ?? []).length} lezioni
          {sum.accuracy !== null ? ` · accuratezza ${String(sum.accuracy).replace('.', ',')}%` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <MasteryRing distribution={mastery} size={64} dark />
          <View style={{ gap: 4, flex: 1 }}>
            <Text style={{ color: colors.secondaryForeground, fontFamily: fonts.bodyBold, fontSize: 15 }}>
              {mastery.learnedPercent}% imparate
            </Text>
            <Text style={{ color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
              {mastery.counts.recover} da recuperare
            </Text>
          </View>
        </View>
      </Pressable>
      {data.subjects.length > 1 && (
        <Btn title="Cambia materia" small variant="soft" icon="repeat" onPress={() => router.push('/subjects')} />
      )}
      <LegendChips
        compact
        questions={subject.questions}
        distribution={mastery}
        onTrain={(ids, state: MasteryState) => {
          const sessionId = startFromQids({
            subjectId: subject.id,
            qids: ids,
            kind: 'review',
            label: `Allenamento · ${MASTERY_LABELS[state].toLowerCase()}`,
            keepOrder: false,
          });
          if (sessionId) router.push('/quiz');
        }}
      />
    </Card>
  );
}

export function ResumeBanner({ session }: { session: Session }) {
  const router = useRouter();
  const { archiveActive } = useStore();
  const answered = session.answers.filter((a) => a !== null).length;
  return (
    <Card tone="accent">
      <Label color={colors.accentForeground}>Prova in sospeso</Label>
      <H2>
        {session.label}: {answered} di {session.items.length} risposte
      </H2>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn title="Riprendi" icon="play" style={{ flex: 1 }} onPress={() => router.push('/quiz')} />
        <Btn
          title="Archivia"
          variant="ghost"
          style={{ flex: 1 }}
          onPress={() =>
            Alert.alert('Archiviare la prova?', 'Verrà salvata come parziale con le risposte date finora.', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Archivia', onPress: archiveActive },
            ])
          }
        />
      </View>
    </Card>
  );
}

export function RecentReview({ subject }: { subject: Subject }) {
  const router = useRouter();
  const { data, startFromQids, updateSettings } = useStore();
  const n = data.settings.lastN;
  const [nText, setNText] = useState(String(n));
  const sessions = data.sessions;
  const info = useMemo(() => {
    const hour = answeredQidsSince(sessions, subject.id, Date.now() - 3600_000);
    const day = answeredQidsSince(sessions, subject.id, startOfToday());
    const lastTests = lastOriginalTests(sessions, subject.id, n);
    return { hour, day, lastTests, lastQ: qidsOfSessions(lastTests) };
  }, [sessions, subject.id, n]);

  const go = (qids: string[], label: string) => {
    if (!qids.length) return;
    startFromQids({ subjectId: subject.id, qids, kind: 'review', label, keepOrder: false });
    router.push('/quiz');
  };
  const row = (title: string, count: number, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      disabled={!count}
      testID={`home-review-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${count} ${count === 1 ? 'domanda' : 'domande'}`}
      accessibilityState={{ disabled: !count }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        opacity: !count ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1 }}>
        <P style={{ fontFamily: fonts.bodySemi }}>{title}</P>
        <P color={colors.mutedForeground} style={{ fontSize: 13 }}>
          {count} {count === 1 ? 'domanda' : 'domande'}
        </P>
      </View>
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
  return (
    <Card>
      <H2>Ripassi recenti</H2>
      {row('Ripasso ultima ora', info.hour.length, () => go(info.hour, 'Ripasso ultima ora'))}
      {row('Ripasso di oggi', info.day.length, () => go(info.day, 'Ripasso di oggi'))}
      {row(`Ripasso ultimi ${n} test`, info.lastQ.length, () => go(info.lastQ, `Ripasso ultimi ${n} test`))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <P style={{ fontSize: 14 }}>Numero di test:</P>
        <TextInput
          value={nText}
          testID="home-review-test-count"
          accessibilityLabel="Numero di test da includere nel ripasso"
          keyboardType="number-pad"
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9]/g, '');
            setNText(clean);
            const v = parseInt(clean, 10);
            if (v >= 1 && v <= 50) updateSettings({ lastN: v });
          }}
          onBlur={() => setNText(String(data.settings.lastN))}
          style={{
            width: 64,
            textAlign: 'center',
            borderWidth: 1.5,
            borderColor: colors.input,
            borderRadius: radius.base,
            paddingVertical: 6,
            fontFamily: fonts.bodySemi,
            fontSize: 14,
            color: colors.text,
            backgroundColor: colors.card,
          }}
        />
        <P color={colors.mutedForeground} style={{ fontSize: 12.5 }}>
          da 1 a 50
        </P>
      </View>
    </Card>
  );
}

export function QuickLinks() {
  const router = useRouter();
  const { isMedium, isWide } = useLayout();
  const columns = isMedium || isWide ? 3 : 2;
  const items: { label: string; icon: React.ComponentProps<typeof Feather>['name']; path: string }[] = [
    { label: 'Statistiche', icon: 'bar-chart-2', path: '/progress' },
    { label: 'Materie', icon: 'book-open', path: '/subjects' },
    { label: 'Domande salvate', icon: 'bookmark', path: '/bookmarks' },
    { label: 'Guida', icon: 'help-circle', path: '/guide' },
    { label: 'Backup', icon: 'save', path: '/backup' },
    { label: 'Aggiornamenti', icon: 'download-cloud', path: '/settings' },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map((it) => (
        <Pressable
          key={it.path}
          onPress={() => router.push(it.path as never)}
          testID={`home-link-${it.path.replace('/', '').replace('/', '-')}`}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          style={({ pressed }) => ({
            flexGrow: 1,
            flexBasis: columns === 3 ? '30%' : '45%',
            backgroundColor: colors.card,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name={it.icon} size={20} color={colors.primary} />
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function UpdateBanner({ release }: { release: ReleaseInfo }) {
  const { busy, install, instructionsVisible, confirmDownload, cancelDownload } = useInstall();
  const { updateSettings } = useStore();
  return (
    <>
      <Card tone="success">
        <Label color={colors.success}>Aggiornamento disponibile</Label>
        <H2>{release.name}</H2>
        <P style={{ fontSize: 14 }}>È disponibile la versione {release.version}.</P>
        <Btn
          title={UPDATE_ACTION_LABEL}
          icon="download"
          loading={busy}
          onPress={() => install(release)}
        />
        <Btn title="Più tardi" variant="ghost" small onPress={() => updateSettings({ dismissedTag: release.tag })} />
      </Card>
      <UpdateInstructionsModal
        visible={instructionsVisible}
        onConfirm={confirmDownload}
        onCancel={cancelDownload}
      />
    </>
  );
}
