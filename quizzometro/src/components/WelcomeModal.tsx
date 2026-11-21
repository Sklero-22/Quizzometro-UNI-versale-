import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Btn, Card, H2, P } from './ui';
import { colors, fonts } from '../theme';

export const WELCOME_HIDE_KEY = 'quizzometro:welcome:do-not-show';

type WelcomeModalProps = {
  visible: boolean;
  onClose: () => void;
  onOpenGuide: () => void;
};

export function WelcomeModal({ visible, onClose, onOpenGuide }: WelcomeModalProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);

  useEffect(() => {
    if (visible) setDoNotShowAgain(false);
  }, [visible]);

  const dismiss = async (openGuide: boolean) => {
    try {
      await AsyncStorage.setItem(WELCOME_HIDE_KEY, doNotShowAgain ? 'true' : 'false');
    } catch (error) {
      console.warn('Non è stato possibile salvare la scelta del messaggio di benvenuto.', error);
    }
    onClose();
    if (openGuide) onOpenGuide();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => void dismiss(false)}
    >
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 22,
          backgroundColor: 'rgba(24, 26, 42, 0.48)',
        }}
      >
        <View style={{ width: '100%', maxWidth: 500 }}>
          <Card style={{ gap: 14 }}>
            <H2 style={{ textAlign: 'center' }}>Benvenuto in Quizzometro</H2>
            <P color={colors.mutedForeground} style={{ textAlign: 'center' }}>
              Per iniziare, leggi la guida: ti aiuta a importare le materie e a preparare i quiz.
            </P>

            <Pressable
              testID="welcome-do-not-show"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: doNotShowAgain }}
              accessibilityLabel="Non mostrare più"
              onPress={() => setDoNotShowAgain((checked) => !checked)}
              style={({ pressed }) => ({
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 23,
                  height: 23,
                  borderRadius: 6,
                  borderWidth: 1.5,
                  borderColor: doNotShowAgain ? colors.primary : colors.input,
                  backgroundColor: doNotShowAgain ? colors.primary : colors.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {doNotShowAgain ? <Feather name="check" size={16} color={colors.primaryForeground} /> : null}
              </View>
              <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text }}>
                Non mostrare più
              </Text>
            </Pressable>

            <Btn title="Apri la guida" icon="book-open" onPress={() => void dismiss(true)} testID="welcome-open-guide" />
            <Btn title="Chiudi" variant="ghost" onPress={() => void dismiss(false)} testID="welcome-close" />
          </Card>
        </View>
      </View>
    </Modal>
  );
}
