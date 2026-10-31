import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { ChatMessage, Conversation } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { openProfile } from '@/components/post-card';
import { ErrorBanner } from '@/components/ui';

// shortcut: polls like the web chat; push notifications (slice 4) will wake the app instead when it is closed
const POLL_MS = 5000;

/** One chat. Loads the latest messages, then asks every few seconds for anything newer than the last one shown. */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastId = useRef(0);
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const append = (incoming: ChatMessage[]) => {
      if (cancelled || !incoming.length) return;
      lastId.current = Math.max(lastId.current, incoming[incoming.length - 1].id);
      setMessages((previous) => [...previous, ...incoming.filter((item) => !previous.some((old) => old.id === item.id))]);
    };
    apiClient
      .getMessages(conversationId)
      .then((response) => {
        if (cancelled) return;
        loaded = true;
        setConversation(response.data?.conversation ?? null);
        append(response.data?.messages ?? []);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Could not load messages.');
      });
    const timer = setInterval(() => {
      if (!loaded) return;
      apiClient
        .getMessages(conversationId, lastId.current || undefined)
        .then((response) => append(response.data?.messages ?? []))
        .catch(() => undefined); // a missed poll is retried on the next tick
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await apiClient.sendMessage(conversationId, draft.trim());
      const sent = response.data;
      if (sent) {
        lastId.current = Math.max(lastId.current, sent.id);
        setMessages((previous) => [...previous, sent]);
      }
      setDraft('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  };

  const other = conversation?.other;
  const canMessage = conversation?.can_message ?? false;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: other?.name ?? 'Chat',
          ...(other
            ? {
                headerTitle: () => (
                  <Pressable accessibilityRole="link" onPress={() => openProfile(other.id)}>
                    <Text style={styles.headerTitle}>{other.name}</Text>
                  </Pressable>
                ),
              }
            : {}),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(message) => String(message.id)}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={<ErrorBanner message={error} />}
          ListEmptyComponent={conversation ? <Text style={styles.muted}>Say hello to {other?.name}.</Text> : undefined}
          renderItem={({ item }) => (
            <View style={[styles.row, item.is_mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                {item.shared ? (
                  <View style={styles.shared}>
                    <Text style={styles.sharedAuthor}>{item.shared.author_name}</Text>
                    <Text style={styles.sharedBody} numberOfLines={3}>
                      {item.shared.body || 'Shared a post'}
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.time, item.is_mine && { color: '#ddd6fe' }]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {item.is_mine && item.read ? ' · Seen' : ''}
                </Text>
              </View>
            </View>
          )}
        />
        {conversation && !canMessage ? <Text style={styles.notice}>You are not connected with {other?.name}. Connect to send messages.</Text> : null}
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            editable={canMessage}
            placeholder="Write a message…"
            placeholderTextColor={colors.textMuted}
            maxLength={2000}
            multiline
            style={[styles.input, !canMessage && { opacity: 0.5 }]}
            accessibilityLabel="Write a message"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={sending || !draft.trim() || !canMessage}
            onPress={() => void send()}
            style={[styles.send, (sending || !draft.trim() || !canMessage) && { opacity: 0.5 }]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  headerTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: '600' },
  list: { padding: spacing.lg, gap: spacing.sm },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: radius['2xl'], paddingHorizontal: 14, paddingVertical: spacing.sm, gap: 4 },
  bubbleMine: { backgroundColor: '#7c3aed' },
  bubbleTheirs: { backgroundColor: colors.cardMuted },
  body: { color: colors.textStrong, fontSize: fontSize.base },
  shared: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'rgba(2, 8, 23, 0.7)', padding: spacing.sm },
  sharedAuthor: { color: colors.accentSoft, fontSize: fontSize.xs, fontWeight: '600' },
  sharedBody: { color: colors.text, fontSize: fontSize.sm },
  time: { color: colors.textMuted, fontSize: 11 },
  notice: { color: colors.textMuted, fontSize: fontSize.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, color: colors.textStrong, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: 10 },
  send: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  sendText: { color: colors.textStrong, fontWeight: '600' },
});
