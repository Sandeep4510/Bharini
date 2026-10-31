import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost, PublicProfile } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { Avatar } from '@/components/avatar';
import { ConnectButton } from '@/components/connect-button';
import { PostCard } from '@/components/post-card';
import { Button, ErrorBanner } from '@/components/ui';

const ROLE_LABELS: Record<string, string> = { artist: 'Artist / Technician', production_house: 'Production house', admin: 'Bharini team' };
const PHOTO_LABELS = { center: 'Front', left: 'Left', right: 'Right', full_length: 'Full length' } as const;

/**
 * Anyone's profile from /users/<id>/: header, About me, follower counts, casting photos and posts.
 * `actions` renders under the header (Log out on your own profile; Follow / Message on others).
 */
export function ProfileView({
  userId,
  actions,
}: {
  userId: number;
  actions?: (profile: PublicProfile, setProfile: (profile: PublicProfile) => void) => ReactNode;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      apiClient.getUserProfile(userId).then(
        (response) => ({ profile: response.data ?? null, error: '' }),
        (caughtError: unknown) => ({ profile: null, error: caughtError instanceof Error ? caughtError.message : 'Could not load this profile.' }),
      ),
    [userId],
  );

  // a failed refresh keeps the profile already on screen and only shows the error
  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    if (result.profile) setProfile(result.profile);
    setError(result.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [load, apply]);

  const refresh = async () => {
    setRefreshing(true);
    apply(await load());
    setRefreshing(false);
  };

  if (!profile) {
    return (
      <View style={styles.center}>
        {error ? <ErrorBanner message={error} /> : <Text style={styles.muted}>Loading profile…</Text>}
      </View>
    );
  }

  const photos = Object.entries(profile.portfolio?.photos ?? {}).filter((entry): entry is [keyof typeof PHOTO_LABELS, string] => Boolean(entry[1]));
  const replacePost = (changed: ArtistPost) => setProfile({ ...profile, posts: profile.posts.map((post) => (post.id === changed.id ? changed : post)) });

  return (
    <FlatList
      data={profile.posts}
      keyExtractor={(post) => String(post.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.accent} colors={[colors.accent]} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.lg, marginBottom: spacing.lg }}>
          <View style={styles.headerCard}>
            <Avatar name={profile.name} photo={profile.profile_photo} size={96} />
            <Text style={styles.role}>{ROLE_LABELS[profile.role] ?? profile.role}</Text>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.username ? <Text style={styles.muted}>@{profile.username}</Text> : null}
            {profile.disciplines.length || profile.location ? (
              <Text style={styles.muted}>{[profile.disciplines.join(', '), profile.location && `📍 ${profile.location}`].filter(Boolean).join(' · ')}</Text>
            ) : null}
            <View style={styles.stats}>
              <Stat value={profile.follower_count} label={profile.follower_count === 1 ? 'Follower' : 'Followers'} />
              <Stat value={profile.following_count} label="Following" />
            </View>
            {actions ? <View style={styles.actions}>{actions(profile, setProfile)}</View> : null}
          </View>

          {profile.bio ? (
            <View style={styles.card}>
              <Text style={styles.section}>About me</Text>
              <Text style={styles.bio}>{profile.bio}</Text>
            </View>
          ) : null}

          {photos.length ? (
            <View style={styles.card}>
              <Text style={styles.section}>Casting photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {photos.map(([slot, url]) => (
                  <View key={slot} style={{ gap: spacing.xs }}>
                    <Image source={url} style={styles.photo} contentFit="cover" accessibilityLabel={PHOTO_LABELS[slot]} />
                    <Text style={styles.photoLabel}>{PHOTO_LABELS[slot]}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Text style={styles.section}>Posts</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No posts yet.</Text>}
      renderItem={({ item }) => <PostCard post={item} onChanged={replacePost} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
    />
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Connect, Follow / Following, and Message (only between connected people, as the API requires). */
export function OtherProfileActions({ profile, setProfile }: { profile: PublicProfile; setProfile: (profile: PublicProfile) => void }) {
  const [busy, setBusy] = useState<'' | 'follow' | 'message'>('');
  const [error, setError] = useState('');

  const toggleFollow = async () => {
    setBusy('follow');
    try {
      const response = await apiClient.setFollow(profile.id, !profile.is_following);
      if (response.data) setProfile({ ...profile, ...response.data });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update follow.');
    } finally {
      setBusy('');
    }
  };

  const message = async () => {
    setBusy('message');
    try {
      const response = await apiClient.startConversation(profile.id);
      if (response.data) router.push({ pathname: '/chat/[id]', params: { id: response.data.id } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not open the chat.');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={{ gap: spacing.sm, alignSelf: 'stretch' }}>
      <ConnectButton userId={profile.id} status={profile.connection} onChange={(connection) => setProfile({ ...profile, connection })} />
      <Button title={profile.is_following ? 'Following' : 'Follow'} variant={profile.is_following ? 'secondary' : 'primary'} busy={busy === 'follow'} onPress={() => void toggleFollow()} />
      {profile.connection === 'connected' ? <Button title="Message" variant="secondary" busy={busy === 'message'} onPress={() => void message()} /> : null}
      <ErrorBanner message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  headerCard: { alignItems: 'center', gap: spacing.xs, borderRadius: radius['3xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.xl },
  role: { color: colors.accentSoft, fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase', marginTop: spacing.sm },
  name: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600', textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: { minWidth: 110, alignItems: 'center', borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(2, 8, 23, 0.5)', paddingVertical: spacing.sm },
  statValue: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: '600' },
  statLabel: { color: colors.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  actions: { alignSelf: 'stretch', marginTop: spacing.md },
  card: { gap: spacing.sm, borderRadius: radius['3xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  section: { color: colors.textMuted, fontSize: fontSize.xs, letterSpacing: 2, textTransform: 'uppercase' },
  bio: { color: colors.text, fontSize: fontSize.base, lineHeight: 22 },
  photo: { width: 110, aspectRatio: 3 / 4, borderRadius: radius.xl },
  photoLabel: { color: colors.textMuted, fontSize: fontSize.xs },
});
