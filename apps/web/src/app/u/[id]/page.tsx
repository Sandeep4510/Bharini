'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { PublicProfile } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { ConnectButton } from '@/components/connect-button';
import { AboutWithStats } from '@/components/follow-stats';
import { Avatar, PostCard, replacePost } from '@/components/artist-post-card';
import { ErrorBanner, errorMessage, primaryButton, secondaryButton } from '@/components/profile-fields';
import { PublicPortfolio } from '@/components/public-portfolio';

const ROLE_LABELS = { artist: 'Artist / Technician', production_house: 'Production house', admin: 'Bharini team' };

function UserProfilePageContent() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    apiClient
      .getUserProfile(Number(id))
      .then((response) => {
        if (cancelled || !response.data) return;
        // production houses have their own profile page
        if (response.data.production_id) router.replace(`/productions/${response.data.production_id}`);
        else setProfile(response.data);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        if (caughtError instanceof ApiError && caughtError.status === 401) router.replace('/auth/login');
        else setError(errorMessage(caughtError, 'Could not load this profile.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const toggleFollow = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.setFollow(profile.id, !profile.is_following);
      if (response.data) setProfile({ ...profile, ...response.data });
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not update follow.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />
        {error ? <ErrorBanner message={error} /> : null}

        {profile ? (
          <>
            <section className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:flex-row sm:items-center">
              <Avatar user={profile} size="h-24 w-24 text-3xl" />
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.16em] text-violet-300">{ROLE_LABELS[profile.role]}</p>
                <h1 className="mt-1 text-3xl font-semibold">{profile.name}</h1>
                {profile.username ? <p className="text-slate-300">@{profile.username}</p> : null}
                {profile.disciplines.length || profile.location ? (
                  <p className="mt-2 text-sm text-slate-400">
                    {[profile.disciplines.join(', '), profile.location && `📍 ${profile.location}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              {profile.is_me ? null : (
                <div className="flex flex-wrap gap-2 self-start">
                <ConnectButton userId={profile.id} status={profile.connection} onChange={(connection) => setProfile({ ...profile, connection })} />
                {profile.connection === 'connected' ? (
                  <Link href={`/messages?with=${profile.id}`} className={secondaryButton}>
                    Message
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleFollow()}
                  className={`${profile.is_following ? secondaryButton : primaryButton} self-start`}
                >
                  {profile.is_following ? 'Following' : 'Follow'}
                </button>
                </div>
              )}
            </section>

            <AboutWithStats
              userId={profile.id}
              bio={profile.bio}
              counts={{ followers: profile.follower_count, following: profile.following_count }}
              emptyText="No About me yet."
            />

            {profile.portfolio ? <PublicPortfolio portfolio={profile.portfolio} /> : null}

            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Posts</h2>
              {profile.posts.length ? (
                profile.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onChanged={(changed) =>
                      setProfile({
                        ...profile,
                        posts: replacePost(profile.posts, changed),
                      })
                    }
                    onDeleted={(postId) =>
                      setProfile({ ...profile, posts: profile.posts.filter((item) => item.id !== postId) })
                    }
                  />
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-700 px-6 py-10 text-center text-slate-400">
                  No posts yet.
                </p>
              )}
            </section>
          </>
        ) : !error ? (
          <p className="py-20 text-center text-slate-300">Loading profile…</p>
        ) : null}
      </div>
    </main>
  );
}

// cacheComponents: useParams needs a Suspense boundary, the id is only known at request time
export default function UserProfilePage() {
  return (
    <Suspense fallback={<p className="min-h-screen bg-slate-950 py-20 text-center text-slate-300">Loading profile…</p>}>
      <UserProfilePageContent />
    </Suspense>
  );
}
