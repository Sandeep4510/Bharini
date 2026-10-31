import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { UserSummary } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { openProfile } from '@/components/post-card';
import { ErrorBanner } from '@/components/ui';

/** Find artists and production houses by name, @username or production name (the web home search, /users/search/). */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!query.trim()) return setResults(null);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.searchPeople(query.trim());
      setResults(response.data?.results ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not search.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.row}>
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              if (!text) setResults(null);
            }}
            onSubmitEditing={() => void search()}
            returnKeyType="search"
            autoCapitalize="none"
            maxLength={100}
            placeholder="Artists and production houses"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            accessibilityLabel="Search artists and production houses"
          />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void search()} style={[styles.button, busy && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{busy ? '…' : 'Search'}</Text>
          </Pressable>
        </View>
        <ErrorBanner message={error} />
      </View>
      <FlatList
        data={results ?? []}
        keyExtractor={(person) => String(person.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={results ? <Text style={styles.muted}>No one matches “{query.trim()}”.</Text> : <Text style={styles.muted}>Search by name or @username.</Text>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${item.name}'s profile`}
            onPress={() => openProfile(item.id)}
            style={({ pressed }) => [styles.person, pressed && { backgroundColor: 'rgba(30, 41, 59, 0.6)' }]}
          >
            <Avatar name={item.name} photo={item.profile_photo} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.username ? `@${item.username}` : item.role === 'production_house' ? 'Production house' : 'Artist'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { flex: 1, color: colors.textStrong, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: 10 },
  button: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  buttonText: { color: colors.textStrong, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', padding: spacing.xl },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  name: { color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: fontSize.sm },
});
