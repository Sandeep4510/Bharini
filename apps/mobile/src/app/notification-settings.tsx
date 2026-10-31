import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { NotificationKind, NotificationSettings } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { ErrorBanner } from '@/components/ui';
import { messageOf } from '@/lib/config';

const ROWS: { kind: NotificationKind; title: string; detail: string }[] = [
  { kind: 'messages', title: 'Messages', detail: 'New messages from your connections' },
  { kind: 'connections', title: 'Connections', detail: 'Connection requests and accepted requests' },
  { kind: 'follows', title: 'New followers', detail: 'When someone starts following you' },
  { kind: 'casting', title: 'Casting calls near you', detail: 'New casting calls in your city' },
];

/** Which pushes this account gets, saved on the server (/notifications/settings/) so they apply on every phone. */
export default function NotificationSettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getNotificationSettings()
      .then((response) => {
        if (!cancelled) setSettings(response.data ?? null);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) setError(messageOf(caughtError, 'Could not load your settings.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (kind: NotificationKind, value: boolean) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [kind]: value }); // flip at once; put it back if saving fails
    try {
      const response = await apiClient.updateNotificationSettings({ [kind]: value });
      if (response.data) setSettings(response.data);
    } catch (caughtError) {
      setSettings(previous);
      setError(messageOf(caughtError, 'Could not save.'));
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ErrorBanner message={error} />
      {settings ? (
        <View style={styles.card}>
          {ROWS.map((row, index) => (
            <View key={row.kind} style={[styles.row, index > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{row.title}</Text>
                <Text style={styles.detail}>{row.detail}</Text>
              </View>
              <Switch
                value={settings[row.kind]}
                onValueChange={(value) => void toggle(row.kind, value)}
                trackColor={{ false: colors.borderStrong, true: colors.accent }}
                thumbColor={colors.textStrong}
                accessibilityLabel={row.title}
              />
            </View>
          ))}
        </View>
      ) : !error ? (
        <Text style={styles.detail}>Loading…</Text>
      ) : null}
      <Text style={styles.note}>You can also turn Bharini notifications off completely in your phone&apos;s settings.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  card: { borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  title: { color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  note: { color: colors.textMuted, fontSize: fontSize.xs },
});
