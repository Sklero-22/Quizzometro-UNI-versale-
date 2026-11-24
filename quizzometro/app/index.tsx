import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { BrandMark, Btn, Card, Empty, P, Screen } from '../src/components/ui';
import { WELCOME_HIDE_KEY, WelcomeModal } from '../src/components/WelcomeModal';
import { useLayout } from '../src/components/layout';
import { hasNewerRelease, useStore } from '../src/data/store';
import {
  getReleaseNote,
  RELEASE_NOTE_SEEN_KEY,
  shouldShowReleaseNote,
} from '../src/data/guide';
import { INSTALLED_VERSION } from '../src/data/releases';
import { useInstall } from '../src/data/useInstall';
import { UPDATE_ACTION_LABEL } from '../src/data/releases';
import { QuickLinks, RecentReview, ResumeBanner, SubjectPanel, UpdateBanner } from '../src/features/home/blocks';
import { UpdateInstructionsModal } from '../src/components/UpdateInstructionsModal';
import { QuizSetup } from '../src/features/quiz/QuizSetup';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fonts, radius } from '../src/theme';

let popupShownForTag: string | null = null;

type HomeSection = 'today' | 'quiz' | 'progress' | 'more';

const HOME_SECTIONS: { id: HomeSection; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'today', label: 'Oggi', icon: 'sun' },
  { id: 'quiz', label: 'Quiz', icon: 'play-circle' },
  { id: 'progress', label: 'Progressi', icon: 'bar-chart-2' },
  { id: 'more', label: 'Altro', icon: 'grid' },
];

export default function Home() {
  const { isWide, isTablet } = useLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: HomeSection }>();
  const { data, activeSubject, activeSession, updateSettings } = useStore();
  const { install, instructionsVisible, confirmDownload, cancelDownload } = useInstall();
  const [section, setSection] = useState<HomeSection>(() => (params.section === 'quiz' ? 'quiz' : 'today'));
  const [releaseNoteStatus, setReleaseNoteStatus] = useState<'checking' | 'shown' | 'done'>('checking');
  const [welcomeStatus, setWelcomeStatus] = useState<'checking' | 'visible' | 'done'>('checking');
  const release = data.settings.latestRelease;
  const newer = hasNewerRelease(data) && release && data.settings.dismissedTag !== release.tag ? release : null;

  useEffect(() => {
    if (params.section === 'quiz') setSection('quiz');
  }, [params.section]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(WELCOME_HIDE_KEY)
      .then((hidden) => {
        if (active) setWelcomeStatus(hidden === 'true' ? 'done' : 'visible');
      })
      .catch((error) => {
        console.warn('Non è stato possibile leggere la scelta del messaggio di benvenuto.', error);
        if (active) setWelcomeStatus('visible');
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (welcomeStatus !== 'done') return;
      let active = true;

      const showReleaseNote = async () => {
        const note = getReleaseNote(INSTALLED_VERSION);
        if (!note) {
          setReleaseNoteStatus('done');
          return;
        }

        let seenVersion: string | null = null;
        try {
          seenVersion = await AsyncStorage.getItem(RELEASE_NOTE_SEEN_KEY);
        } catch (error) {
          console.warn('Non è stato possibile leggere le note già mostrate.', error);
        }
        if (!active) return;

        if (!shouldShowReleaseNote(INSTALLED_VERSION, seenVersion)) {
          setReleaseNoteStatus('done');
          return;
        }

        try {
          await AsyncStorage.setItem(RELEASE_NOTE_SEEN_KEY, INSTALLED_VERSION);
        } catch (error) {
          console.warn('Non è stato possibile salvare la versione della Nota.', error);
        }
        if (!active) return;

        setReleaseNoteStatus('shown');
        Alert.alert(
          'Nota',
          `${note.title}\n\n${note.summary}`,
          [
            { text: 'Apri la Guida', onPress: () => router.push('/guide') },
            { text: 'Chiudi', style: 'cancel' },
          ],
          { cancelable: false },
        );
      };

      void showReleaseNote().catch((error) => {
        console.warn('Non è stato possibile mostrare le note della versione.', error);
        if (active) setReleaseNoteStatus('done');
      });

      return () => {
        active = false;
      };
    }, [router, welcomeStatus]),
  );

  useEffect(() => {
    if (releaseNoteStatus !== 'done' || !newer || popupShownForTag === newer.tag) return;
    popupShownForTag = newer.tag;
    Alert.alert(
      'Aggiornamento disponibile',
      `${newer.name} (versione ${newer.version}) è disponibile. Il download partirà nel browser.`,
      [
        { text: 'Più tardi', style: 'cancel', onPress: () => updateSettings({ dismissedTag: newer.tag }) },
        { text: UPDATE_ACTION_LABEL, onPress: () => install(newer) },
      ],
    );
  }, [newer, install, updateSettings, releaseNoteStatus]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
      <BrandMark size={isTablet ? 56 : 46} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.displayHeavy, fontSize: isTablet ? 26 : 22, color: colors.text }}>
          Quizzometro
        </Text>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary }}>UNI(versale)</Text>
      </View>
    </View>
  );

  const navigation = (
    <View
      accessibilityRole="tablist"
      style={{
        width: '100%',
        maxWidth: isWide ? 900 : isTablet ? 720 : 620,
        alignSelf: 'center',
        flexDirection: 'row',
        justifyContent: 'space-around',
        gap: 8,
        paddingHorizontal: 8,
        paddingTop: 7,
        paddingBottom: 5,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      {HOME_SECTIONS.map((item) => {
        const selected = section === item.id;
        return (
          <Pressable
            key={item.id}
            testID={`home-tab-${item.id}`}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            onPress={() => setSection(item.id)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 52,
              paddingHorizontal: 4,
              paddingVertical: 7,
              borderRadius: radius.base,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              backgroundColor: selected ? colors.card : 'transparent',
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Feather name={item.icon} size={18} color={selected ? colors.primary : colors.mutedForeground} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: selected ? fonts.bodyBold : fonts.bodyMedium,
                fontSize: 11.5,
                color: selected ? colors.text : colors.mutedForeground,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  let content: React.ReactNode;
  if (section === 'today') {
    content = activeSubject ? (
      <>
        <SubjectPanel subject={activeSubject} />
        {activeSession ? <ResumeBanner session={activeSession} /> : null}
        <RecentReview subject={activeSubject} />
      </>
    ) : (
      <Card>
        <Empty title="Nessuna materia" text="Importa un file JSON o HTML dalla schermata Materie per iniziare." />
        <Btn title="Vai alle Materie" icon="book-open" onPress={() => router.push('/subjects')} testID="home-empty-subjects" />
      </Card>
    );
  } else if (section === 'quiz') {
    content = activeSubject ? (
      <>
        <SubjectPanel subject={activeSubject} />
        <QuizSetup key={activeSubject.id} subject={activeSubject} />
      </>
    ) : (
      <Card>
        <Empty title="Scegli una materia" text="La configurazione della prova sarà disponibile dopo aver importato o selezionato una materia." />
        <Btn title="Vai alle Materie" icon="book-open" onPress={() => router.push('/subjects')} testID="home-quiz-subjects" />
      </Card>
    );
  } else if (section === 'progress') {
    content = (
      <>
        <Card tone="ink">
          <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.secondaryForeground }}>
            Il tuo percorso
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft }}>
            Rivedi risultati, accuratezza e copertura delle domande incontrate.
          </Text>
          <Btn title="Apri statistiche e progressi" icon="bar-chart-2" onPress={() => router.push('/progress')} testID="home-open-stats" />
        </Card>
        {activeSubject ? (
          <SubjectPanel subject={activeSubject} />
        ) : (
          <Card>
            <Empty title="Nessun progresso ancora" text="Seleziona una materia e completa una prova per iniziare a registrare i risultati." />
          </Card>
        )}
      </>
    );
  } else {
    content = (
      <>
        {newer ? <UpdateBanner release={newer} /> : null}
        <Card>
          <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.text }}>Strumenti</Text>
          <P color={colors.mutedForeground} style={{ fontSize: 14 }}>
            Materie, domande salvate, guida, backup e aggiornamenti.
          </P>
        </Card>
        <QuickLinks />
      </>
    );
  }

  return (
    <>
      <Screen key={section} maxWidth={isWide ? 900 : isTablet ? 720 : 620} footer={navigation}>
        {header}
        {content}
        <P color={colors.mutedForeground} style={{ fontSize: 12, textAlign: 'center', paddingBottom: 6 }}>
          Funziona senza account e senza connessione.
        </P>
      </Screen>
      <WelcomeModal
        visible={welcomeStatus === 'visible'}
        onClose={() => setWelcomeStatus('done')}
        onOpenGuide={() => {
          setWelcomeStatus('done');
          router.push('/guide');
        }}
      />
      <UpdateInstructionsModal
        visible={instructionsVisible}
        onConfirm={confirmDownload}
        onCancel={cancelDownload}
      />
    </>
  );
}
