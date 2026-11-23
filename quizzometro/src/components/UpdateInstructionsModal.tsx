import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Btn, H2, P } from './ui';
import { colors, fonts, radius } from '../theme';

const STEPS = [
  'Si aprirà il browser e partirà il download.',
  'Al termine tocca la notifica “Download completato” oppure apri la cartella Download.',
  'Tocca “Aggiorna” o “Installa”. Se Android chiede il permesso per il browser, attiva “Consenti da questa fonte” e torna indietro.',
  'Le tue materie e i tuoi progressi restano.',
];

export function UpdateInstructionsModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityLabel="Come aggiornare Quizzometro">
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.icon}>
              <Feather name="download-cloud" size={23} color={colors.primary} />
            </View>
            <H2 style={styles.title}>Come aggiornare</H2>
            <P color={colors.mutedForeground} style={styles.intro}>
              Il file APK verrà scaricato dal browser. Segui questi passaggi per installare l’aggiornamento.
            </P>
            <View style={styles.steps}>
              {STEPS.map((step, index) => (
                <View key={step} style={styles.step}>
                  <View style={styles.number}>
                    <Text style={styles.numberText}>{index + 1}</Text>
                  </View>
                  <P style={styles.stepText}>{step}</P>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.actions}>
            <Btn title="Inizia download" icon="download" onPress={onConfirm} />
            <Btn title="Annulla" variant="ghost" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
    backgroundColor: 'rgba(31, 35, 71, 0.58)',
  },
  dialog: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    overflow: 'hidden',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 20,
    gap: 14,
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
  },
  steps: {
    gap: 12,
    paddingTop: 3,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  number: {
    width: 26,
    height: 26,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.accentSoft,
  },
  numberText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 9,
  },
});
