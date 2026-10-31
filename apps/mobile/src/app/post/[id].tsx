import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost, ArtistPostComment } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { openProfile, PostCard } from '@/components/post-card';
import { ErrorBanner } from '@/components/ui';
import { timeAgo } from '@/lib/format';

/** One post with its comments; reached from the comment button on a feed card. */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = Number(id);
  const [post, setPost] = useState<ArtistPost | null>(null);
  const [comments, setComments] = useState<ArtistPostComment[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getPost(postId), apiClient.getComments(postId)])
      .then(([postResponse, commentResponse]) => {
        if (cancelled) return;
        setPost(postResponse.data ?? null);
        setComments(commentResponse.data?.comments ?? []);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Could not load this post.');
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const removeComment = async (comment: ArtistPostComment) => {
    try {
      await apiClient.deleteComment(postId, comment.id);
      setComments((previous) => previous.filter((item) => item.id !== comment.id));
      setPost((previous) => (previous ? { ...previous, comment_count: Math.max(0, previous.comment_count - 1) } : previous));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete the comment.');
    }
  };

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const response = await apiClient.addArtistComment(postId, draft.trim());
      const added = response.data;
      if (added) {
        setComments((previous) => [...previous, added]);
        setPost((previous) => (previous ? { ...previous, comment_count: previous.comment_count + 1 } : previous));
      }
      setDraft('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not comment.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Post' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          data={comments}
          keyExtractor={(comment) => String(comment.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
              <ErrorBanner message={error} />
              {post ? <PostCard post={post} onChanged={setPost} showCommentsLink={false} /> : !error ? <Text style={styles.muted}>Loading…</Text> : null}
              <Text style={styles.section}>Comments</Text>
            </View>
          }
          ListEmptyComponent={post ? <Text style={styles.muted}>No comments yet. Be the first.</Text> : undefined}
          renderItem={({ item }) => (
            <View style={styles.comment}>
              <Pressable accessibilityRole="link" accessibilityLabel={`${item.author.name}'s profile`} onPress={() => openProfile(item.author.id)}>
                <Avatar name={item.author.name} photo={item.author.profile_photo} size={32} />
              </Pressable>
              <View style={styles.bubble}>
                <View style={styles.commentHead}>
                  <Text style={[styles.commentName, { flex: 1 }]}>
                    {item.author.name} <Text style={styles.muted}>· {timeAgo(item.created_at)}</Text>
                  </Text>
                  {item.can_delete ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Delete comment" onPress={() => void removeComment(item)} hitSlop={10}>
                      <Text style={styles.delete}>🗑️</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.commentBody}>{item.body}</Text>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a comment…"
            placeholderTextColor={colors.textMuted}
            maxLength={1000}
            multiline
            style={styles.input}
            accessibilityLabel="Write a comment"
          />
          <Pressable accessibilityRole="button" disabled={sending || !draft.trim()} onPress={() => void send()} style={[styles.send, (sending || !draft.trim()) && { opacity: 0.5 }]}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  section: { color: colors.textMuted, fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  comment: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bubble: { flex: 1, borderRadius: radius.xl, backgroundColor: 'rgba(30, 41, 59, 0.6)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  delete: { fontSize: fontSize.sm },
  commentName: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: '600' },
  commentBody: { color: colors.text, fontSize: fontSize.sm, marginTop: 2 },
  composer: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end', padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  input: { flex: 1, maxHeight: 120, color: colors.textStrong, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: 14, paddingVertical: 10 },
  send: { backgroundColor: colors.accent, borderRadius: radius.xl, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  sendText: { color: colors.textStrong, fontWeight: '600' },
});
