import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, ProfileLanguage, ProfileOptions } from '@bharini/types';
import { colors, fontSize, spacing } from '@bharini/theme';

import { formStyles, SelectField, SmallButton } from '@/components/form';
import { Button, ErrorBanner } from '@/components/ui';
import { messageOf } from '@/lib/config';

type Props = { profile: ArtistProfile; options: ProfileOptions; onProfile: (profile: ArtistProfile) => void; onNext: () => void; onBack: () => void };

/** Step 2: languages and how well you speak them (PUT /profile/languages/). */
export function LanguagesStep({ profile, options, onProfile, onNext, onBack }: Props) {
  const [rows, setRows] = useState<{ language: string; level: string }[]>(profile.languages.length ? profile.languages : [{ language: '', level: '' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (index: number, change: Partial<{ language: string; level: string }>) =>
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const submit = async () => {
    setError('');
    if (rows.some((row) => !row.language || !row.level)) return setError('Pick a language and level in every row.');
    if (new Set(rows.map((row) => row.language)).size !== rows.length) return setError('Each language can be added only once.');
    setBusy(true);
    try {
      const response = await apiClient.setLanguages(rows as ProfileLanguage[]);
      if (response.data) onProfile(response.data);
      onNext();
    } catch (caughtError) {
      setError(messageOf(caughtError, 'Could not save languages.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <ErrorBanner message={error} />
      <Text style={formStyles.muted}>Add every language you can perform in, and how well you speak it.</Text>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <SelectField value={row.language} onChange={(language) => update(index, { language })} options={options.languages} placeholder="Language" />
            <SelectField value={row.level} onChange={(level) => update(index, { level })} options={options.language_levels} placeholder="Level" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove language"
            disabled={rows.length === 1}
            onPress={() => setRows((previous) => previous.filter((_, i) => i !== index))}
            style={[styles.remove, rows.length === 1 && { opacity: 0.3 }]}
            hitSlop={8}
          >
            <Text style={styles.removeText}>🗑️</Text>
          </Pressable>
        </View>
      ))}
      <SmallButton title="+ Add language" onPress={() => setRows((previous) => [...previous, { language: '', level: '' }])} />
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button title="Back" variant="secondary" onPress={onBack} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="Save & continue" busy={busy} onPress={() => void submit()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.md },
  remove: { padding: spacing.sm },
  removeText: { fontSize: fontSize.lg },
  actions: { flexDirection: 'row', gap: spacing.md },
});
