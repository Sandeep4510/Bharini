import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fontSize, radius, spacing } from '@bharini/theme';

/** The round violet "B" used as the Bharini logo. */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size }]}>
      <Text style={[styles.logoText, { fontSize: size * 0.45 }]}>B</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  busy = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || busy) && { opacity: 0.75 },
      ]}
    >
      {busy ? <ActivityIndicator color={colors.textStrong} /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

/** Labelled text box; `secret` adds a Show / Hide toggle. */
export function Field({ label, secret = false, ...input }: TextInputProps & { label: string; secret?: boolean }) {
  const [hidden, setHidden] = useState(secret);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          secureTextEntry={hidden}
          style={styles.input}
          accessibilityLabel={label}
          {...input}
        />
        {secret ? (
          <Pressable accessibilityRole="button" onPress={() => setHidden((value) => !value)} hitSlop={8}>
            <Text style={styles.toggle}>{hidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  logo: { borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.textStrong, fontWeight: '700' },
  button: { borderRadius: radius.xl, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card },
  buttonText: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: '600' },
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(2, 8, 23, 0.7)',
    paddingHorizontal: 14,
  },
  input: { flex: 1, color: colors.textStrong, fontSize: fontSize.base, paddingVertical: 12 },
  toggle: { color: colors.accentSoft, fontSize: fontSize.sm, fontWeight: '600' },
  error: { borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: colors.dangerBg, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
  card: { borderRadius: radius['3xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl, gap: spacing.lg },
});
