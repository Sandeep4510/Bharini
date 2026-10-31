import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { ChatMessage, ConnectionRequest, Conversation } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { ConnectButton } from '@/components/connect-button';
import { openProfile } from '@/components/post-card';
import { ErrorBanner } from '@/components/ui';
import { timeAgo } from '@/lib/format';

function preview(message: ChatMessage | null) {
  if (!message) return 'No messages yet';
  const text = message.body || (message.shared ? `Shared a post by ${message.shared.author_name}` : '');
  return `${message.is_mine ? 'You: ' : ''}${text}`;
}

/** Your chats, newest first. Reloads whenever the tab comes into view, so unread counts stay fresh. */
export default function MessagesScreen() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [response, pending] = await Promise.all([
        apiClient.getConversations(),
        apiClient.getConnectionRequests().catch(() => null), // requests are extra; chats still load without them
      ]);
      setConversations(response.data?.conversations ?? []);
      if (pending) setRequests(pending.data?.requests ?? []);
      setError('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load your chats.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={conversations ?? []}
        keyExtractor={(conversation) => String(conversation.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Messages</Text>
            <ErrorBanner message={error} />
            {requests.length ? (
              <View style={styles.requests}>
                <Text style={styles.section}>Connection requests · {requests.length}</Text>
                {requests.map((person) => (
                  <View key={person.id} style={{ gap: spacing.sm }}>
                    <Pressable accessibilityRole="link" accessibilityLabel={`${person.name}'s profile`} onPress={() => openProfile(person.id)} style={styles.requestRow}>
                      <Avatar name={person.name} photo={person.profile_photo} size={36} />
                      <Text style={styles.name} numberOfLines={1}>
                        {person.name}
                      </Text>
                    </Pressable>
                    <ConnectButton
                      userId={person.id}
                      status="pending_received"
                      onChange={() => setRequests((previous) => previous.filter((item) => item.id !== person.id))}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {conversations === null ? 'Loading chats…' : 'No chats yet. Connect with people, then press Message on their profile.'}
          </Text>
        }
        renderItem={({ item }) => {
          const unread = item.unread_count > 0;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${item.other.name}${unread ? `, ${item.unread_count} unread` : ''}`}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(30, 41, 59, 0.6)' }]}
            >
              <Avatar name={item.other.name} photo={item.other.profile_photo} size={48} />
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.other.name}
                  </Text>
                  {item.last_message ? <Text style={styles.time}>{timeAgo(item.last_message.created_at)}</Text> : null}
                </View>
                <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                  {preview(item.last_message)}
                </Text>
              </View>
              {unread ? <Text style={styles.badge}>{item.unread_count}</Text> : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  requests: { gap: spacing.md, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  section: { color: colors.textMuted, fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase' },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  empty: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', padding: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  name: { flex: 1, color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600' },
  time: { color: colors.textMuted, fontSize: fontSize.xs },
  preview: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  previewUnread: { color: colors.textStrong, fontWeight: '600' },
  badge: { minWidth: 22, textAlign: 'center', borderRadius: radius.full, backgroundColor: colors.accent, color: colors.textStrong, fontSize: fontSize.xs, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
});
