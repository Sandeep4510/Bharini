import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { Post } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { cardStyles } from '@/components/post-card';
import { ShareSheet } from '@/components/share-sheet';
import { WEB_URL } from '@/lib/config';
import { timeAgo } from '@/lib/format';

const GENDER = { any: 'Any', male: 'Male', female: 'Female', other: 'Other' } as const;

/** A production house's casting call, shown at the top of an artist's feed. */
export function CastingCard({ post }: { post: Post }) {
  const [sharing, setSharing] = useState(false);
  const [shareCount, setShareCount] = useState(post.share_count);
  const casting = post.casting;
  const rows: [string, string][] = casting
    ? [
        ['Age', `${casting.age_min} – ${casting.age_max}`],
        ['Gender', GENDER[casting.gender]],
        ['Languages', casting.languages],
        ['Location', casting.location],
        ['Approx pay', casting.approx_pay],
      ]
    : [];

  return (
    <View style={cardStyles.card}>
      <View style={styles.header}>
        <Avatar name={post.production.name} photo={post.production.profile_picture} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {post.production.name}
          </Text>
          <Text style={styles.meta}>{timeAgo(post.created_at)}</Text>
        </View>
        <View style={styles.badges}>
          {post.near_you ? <Text style={[styles.badge, styles.near]}>📍 Near you</Text> : null}
          <Text style={[styles.badge, styles.casting]}>CASTING CALL</Text>
        </View>
      </View>
      {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
      {post.image ? <Image source={post.image} style={styles.image} contentFit="cover" /> : null}
      {rows.length ? (
        <View style={styles.grid}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.cell}>
              <Text style={styles.cellLabel}>{label}</Text>
              <Text style={styles.cellValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={() => setSharing(true)} style={styles.share} hitSlop={6}>
        <Text style={styles.shareText}>➤ Share · {shareCount}</Text>
      </Pressable>
      {sharing ? (
        <ShareSheet
          post={{ kind: 'production', id: post.id }}
          url={`${WEB_URL}/productions/${post.production.id}#post-${post.id}`}
          title={`Casting call by ${post.production.name} on Bharini`}
          onClose={() => setSharing(false)}
          onShared={() =>
            void apiClient
              .sharePost(post.id)
              .then((response) => setShareCount(response.data?.share_count ?? shareCount))
              .catch(() => undefined) // the count is cosmetic
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.textStrong, fontSize: fontSize.base, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: fontSize.xs },
  badges: { alignItems: 'flex-end', gap: spacing.xs },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, fontSize: 10, fontWeight: '700', overflow: 'hidden' },
  casting: { backgroundColor: colors.accent, color: colors.textStrong, letterSpacing: 1 },
  near: { backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#a7f3d0' },
  body: { color: colors.text, fontSize: fontSize.base, lineHeight: 22 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius['2xl'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(2, 8, 23, 0.6)', padding: spacing.sm },
  cellLabel: { color: colors.accentSoft, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  share: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  shareText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  cellValue: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: '500', marginTop: 2 },
});
