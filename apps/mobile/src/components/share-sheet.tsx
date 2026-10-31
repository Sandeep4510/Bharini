import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { SharedPostRef, UserSummary } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { ErrorBanner } from '@/components/ui';

/**
 * Same order as the web share menu: send to a connection in a Bharini message first, then the phone's own share
 * sheet (WhatsApp, copy link, …) with the website link.
 */
export function ShareSheet({
  post,
  url,
  title,
  onClose,
  onShared,
}: {
  post: SharedPostRef;
  url: string;
  title: string;
  onClose: () => void;
  onShared?: () => void;
}) {
  const [people, setPeople] = useState<UserSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [sentTo, setSentTo] = useState<number[]>([]);
  const [sending, setSending] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .getMyConnections(query.trim())
        .then((response) => {
          if (!cancelled) setPeople(response.data?.connections ?? []);
        })
        .catch((caughtError: unknown) => {
          if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Could not load your connections.');
        });
    }, 300); // wait for typing to pause before searching
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const send = async (person: UserSummary) => {
    setSending(person.id);
    setError('');
    try {
      const conversation = (await apiClient.startConversation(person.id)).data;
      if (conversation) await apiClient.sendMessage(conversation.id, note.trim(), post);
      setSentTo((previous) => [...previous, person.id]);
      onShared?.();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send.');
    } finally {
      setSending(0);
    }
  };

  const shareOutside = async () => {
    const result = await Share.share({ message: `${title}\n${url}`, url, title }).catch(() => null);
    if (result?.action === Share.sharedAction) onShared?.();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close share" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text style={styles.title}>Share post</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>✉ Send in a Bharini message</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search your connections" placeholderTextColor={colors.textMuted} style={styles.input} accessibilityLabel="Search your connections" />
        <TextInput value={note} onChangeText={setNote} placeholder="Add a note (optional)" placeholderTextColor={colors.textMuted} maxLength={2000} style={styles.input} accessibilityLabel="Add a note" />
        <ErrorBanner message={error} />
        <FlatList
          data={people ?? []}
          keyExtractor={(person) => String(person.id)}
          style={{ maxHeight: 260 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.muted}>{people === null ? 'Loading connections…' : query ? 'No connections match.' : 'No connections yet. Connect with people to message them.'}</Text>
          }
          renderItem={({ item }) => {
            const sent = sentTo.includes(item.id);
            return (
              <View style={styles.person}>
                <Avatar name={item.name} photo={item.profile_photo} size={36} />
                <Text style={styles.personName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Send to ${item.name}`}
                  disabled={sent || sending === item.id}
                  onPress={() => void send(item)}
                  style={[styles.send, (sent || sending === item.id) && { opacity: 0.6 }]}
                >
                  <Text style={styles.sendText}>{sent ? 'Sent' : sending === item.id ? '…' : 'Send'}</Text>
                </Pressable>
              </View>
            );
          }}
        />

        <Pressable accessibilityRole="button" onPress={() => void shareOutside()} style={styles.outside}>
          <Text style={styles.outsideText}>↗ Share outside Bharini…</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.7)' },
  sheet: { gap: spacing.md, backgroundColor: colors.card, borderTopLeftRadius: radius['3xl'], borderTopRightRadius: radius['3xl'], borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.xl, paddingBottom: spacing['2xl'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: '600' },
  close: { color: colors.textMuted, fontSize: fontSize.lg },
  section: { color: colors.accentSoft, fontSize: fontSize.sm, fontWeight: '600' },
  input: { color: colors.textStrong, fontSize: fontSize.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 10 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, paddingVertical: spacing.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  personName: { flex: 1, color: colors.textStrong, fontSize: fontSize.base },
  send: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  sendText: { color: colors.textStrong, fontWeight: '600', fontSize: fontSize.sm },
  outside: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  outsideText: { color: colors.text, fontSize: fontSize.base, fontWeight: '600' },
});
