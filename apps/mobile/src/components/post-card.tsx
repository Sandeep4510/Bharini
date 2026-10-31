import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { PostVideo } from '@/components/post-video';
import { ShareSheet } from '@/components/share-sheet';
import { WEB_URL } from '@/lib/config';
import { timeAgo } from '@/lib/format';

export function openProfile(userId: number) {
  router.push({ pathname: '/user/[id]', params: { id: userId } });
}

/** An artist post: author, text, photo or video, and like / comment actions. */
export function PostCard({
  post,
  onChanged,
  showCommentsLink = true,
}: {
  post: ArtistPost;
  onChanged: (post: ArtistPost) => void;
  showCommentsLink?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const toggleLike = async () => {
    setBusy(true);
    try {
      const response = await apiClient.setLike(post.id, !post.liked);
      if (response.data) onChanged({ ...post, ...response.data });
    } catch {
      // the heart keeps its old state; tapping again retries
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="link" accessibilityLabel={`${post.author.name}'s profile`} onPress={() => openProfile(post.author.id)} style={styles.author}>
        <Avatar name={post.author.name} photo={post.author.profile_photo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {post.author.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {post.author.username ? `@${post.author.username} · ` : ''}
            {timeAgo(post.created_at)}
          </Text>
        </View>
      </Pressable>

      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.media && post.media_kind === 'image' ? <Image source={post.media} style={styles.image} contentFit="cover" /> : null}
      {post.media && post.media_kind === 'video' ? <PostVideo uri={post.media} /> : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={post.liked ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: post.liked, busy }}
          disabled={busy}
          onPress={() => void toggleLike()}
          style={styles.action}
          hitSlop={6}
        >
          <Text style={[styles.icon, post.liked && { color: colors.like }]}>{post.liked ? '♥' : '♡'}</Text>
          <Text style={styles.count}>{post.like_count}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Comments"
          disabled={!showCommentsLink}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
          style={styles.action}
          hitSlop={6}
        >
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.count}>{post.comment_count}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={() => setSharing(true)} style={styles.action} hitSlop={6}>
          <Text style={styles.icon}>➤</Text>
          <Text style={styles.count}>Share</Text>
        </Pressable>
      </View>
      {sharing ? (
        <ShareSheet
          post={{ kind: 'artist', id: post.id }}
          url={`${WEB_URL}/posts/${post.id}`}
          title={`Post by ${post.author.name} on Bharini`}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </View>
  );
}

export const cardStyles = StyleSheet.create({
  card: { borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: spacing.lg, gap: spacing.md },
});

const styles = StyleSheet.create({
  card: cardStyles.card,
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: fontSize.xs },
  body: { color: colors.text, fontSize: fontSize.base, lineHeight: 22 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius['2xl'] },
  actions: { flexDirection: 'row', gap: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  icon: { color: colors.text, fontSize: fontSize.lg },
  count: { color: colors.textMuted, fontSize: fontSize.sm },
});
