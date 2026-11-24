import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../theme';
import { useLayout } from './layout';

export function Screen({
  title,
  onBack,
  children,
  scroll = true,
  maxWidth,
  right,
  footer,
}: {
  title?: string;
  onBack?: () => void;
  children: React.ReactNode;
  scroll?: boolean;
  maxWidth?: number;
  right?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { pad, compactLandscape, maxContentWidth } = useLayout();
  const inner: ViewStyle = { width: '100%', maxWidth: maxWidth ?? maxContentWidth, alignSelf: 'center', paddingHorizontal: pad };
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, paddingTop: webTopInset }}>
      <StatusBar style="dark" backgroundColor={colors.background} />
      {title !== undefined && (
        <View style={[inner, styles.header, compactLandscape && { paddingVertical: 4 }]}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={10}
              accessibilityLabel="Indietro"
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="arrow-left" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <Text style={styles.screenTitle} numberOfLines={1}>
            {title}
          </Text>
          {right}
        </View>
      )}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: Math.max(32, webBottomInset), paddingTop: 6, gap: 14 }]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[inner, { flex: 1 }]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({
  children,
  tone = 'plain',
  style,
}: {
  children: React.ReactNode;
  tone?: 'plain' | 'ink' | 'accent' | 'danger' | 'success' | 'muted';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = {
    plain: colors.card,
    ink: colors.text,
    accent: colors.accentSoft,
    danger: colors.dangerSoft,
    success: colors.successSoft,
    muted: colors.muted,
  }[tone];
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.card,
          padding: 16,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: tone === 'ink' ? colors.text : colors.border,
          gap: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Label({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.bodyBold,
          fontSize: 11.5,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: color ?? colors.mutedForeground,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H2({ children, color, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[{ fontFamily: fonts.display, fontSize: 19, color: color ?? colors.text, lineHeight: 24 }, style]}>
      {children}
    </Text>
  );
}

export function P({
  children,
  color,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, color: color ?? colors.text }, style]}
    >
      {children}
    </Text>
  );
}

type BtnVariant = 'primary' | 'ink' | 'ghost' | 'danger' | 'soft';

export function Btn({
  title,
  onPress,
  variant = 'primary',
  small,
  loading,
  disabled,
  icon,
  style,
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  small?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Feather>['name'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const v = {
    primary: { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary },
    ink: { bg: colors.text, fg: colors.secondaryForeground, border: colors.text },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.input },
    danger: { bg: colors.destructive, fg: colors.primaryForeground, border: colors.destructive },
    soft: { bg: colors.accentSoft, fg: colors.accentForeground, border: colors.accent },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: 1.5,
          borderRadius: radius.base,
          paddingVertical: small ? 8 : 13,
          paddingHorizontal: small ? 12 : 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : icon ? (
        <Feather name={icon} size={small ? 15 : 18} color={v.fg} />
      ) : null}
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: small ? 13.5 : 15.5, color: v.fg }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'plain' | 'ink';
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [
        {
          paddingVertical: 7,
          paddingHorizontal: 13,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor:
            tone === 'ink' ? (selected ? colors.accent : 'rgba(245,239,227,0.45)') : selected ? colors.text : colors.input,
          backgroundColor: selected ? (tone === 'ink' ? colors.accent : colors.accentSoft) : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.bodySemi,
          fontSize: 13.5,
          // su sfondo scuro: testo chiaro se non selezionata, scuro sulla pillola gialla selezionata
          color: tone === 'ink' ? (selected ? colors.text : colors.secondaryForeground) : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Bar({ value, color = colors.primary, height = 8 }: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 6 }}>
      <Feather name="inbox" size={28} color={colors.mutedForeground} />
      <H2 style={{ textAlign: 'center' }}>{title}</H2>
      {text ? <P color={colors.mutedForeground} style={{ textAlign: 'center' }}>{text}</P> : null}
    </View>
  );
}

export function Notice({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'danger' | 'success';
}) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.accentSoft;
  const icon = tone === 'danger' ? 'alert-triangle' : tone === 'success' ? 'check-circle' : 'info';
  const fg = tone === 'danger' ? colors.destructive : tone === 'success' ? colors.success : colors.accentForeground;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.base, padding: 12, flexDirection: 'row', gap: 10 }}>
      <Feather name={icon} size={18} color={fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <P style={{ fontSize: 14, lineHeight: 20 }}>{children}</P> : children}
      </View>
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ICON = require('../../assets/icon.png');

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <Image
      source={ICON}
      style={{ width: size, height: size, borderRadius: size * 0.24, borderWidth: 1, borderColor: colors.border }}
      contentFit="cover"
    />
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 24, gap: 12 }}>
          <H2>Qualcosa è andato storto</H2>
          <P color={colors.mutedForeground}>{this.state.error.message}</P>
          <Btn title="Riprova" onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  screenTitle: { flex: 1, fontFamily: fonts.display, fontSize: 21, color: colors.text },
});
