import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost, Post } from '@bharini/types';
import { colors, fontSize, spacing } from '@bharini/theme';

import { CastingCard } from '@/components/casting-card';
import { Composer } from '@/components/composer';
import { PostCard } from '@/components/post-card';
import { ErrorBanner, Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth';

type FeedItem = { kind: 'casting'; post: Post } | { kind: 'post'; post: ArtistPost };

/** Fetches posts and (for artists) casting calls; never throws, so callers only apply the result. */
async function fetchFeed(isArtist: boolean): Promise<{ items: FeedItem[] } | { error: string }> {
  const [posts, castings] = await Promise.allSettled([apiClient.getPosts(), isArtist ? apiClient.getOpportunities() : Promise.resolve(null)]);
  if (posts.status === 'rejected') return { error: posts.reason instanceof Error ? posts.reason.message : 'Could not load the feed.' };
  return {
    items: [
      ...(castings.status === 'fulfilled' && castings.value ? castings.value.data?.posts ?? [] : []).map((post) => ({ kind: 'casting' as const, post })),
      ...(posts.value.data?.posts ?? []).map((post) => ({ kind: 'post' as const, post })),
    ],
  };
}

/** Casting calls first (in the artist's city first), then posts, people you follow first. Same order as the web home. */
export default function HomeScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const isArtist = user?.role === 'artist';

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchFeed>>) => {
    if ('error' in result) return setError(result.error);
    setError('');
    setItems(result.items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchFeed(isArtist).then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [isArtist, apply]);

  const refresh = async () => {
    setRefreshing(true);
    apply(await fetchFeed(isArtist));
    setRefreshing(false);
  };

  // a follow or like change applies to that post; the API sends the full post back
  const replace = (changed: ArtistPost) =>
    setItems((previous) => previous?.map((item) => (item.kind === 'post' && item.post.id === changed.id ? { kind: 'post', post: changed } : item)) ?? null);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => `${item.kind}-${item.post.id}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.lg }}>
            <View style={styles.header}>
              <Logo size={40} />
              <Text style={styles.greeting}>Hi {user?.first_name || 'there'}</Text>
            </View>
            <ErrorBanner message={error} />
            <Composer onPosted={(post) => setItems((previous) => [{ kind: 'post', post }, ...(previous ?? [])])} />
            <Text style={styles.section}>Feed · people you follow first</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{items === null ? 'Loading your feed…' : 'Nothing here yet. Follow people to fill your feed.'}</Text>}
        renderItem={({ item }) => (item.kind === 'casting' ? <CastingCard post={item.post} /> : <PostCard post={item.post} onChanged={replace} />)}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  greeting: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  section: { color: colors.textMuted, fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
  empty: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.xl },
});
