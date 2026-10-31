import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, spacing } from '@bharini/theme';

/** Stand-in for tabs that arrive in the next slice. */
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>Coming next.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  text: { color: colors.textMuted, fontSize: fontSize.sm },
});
