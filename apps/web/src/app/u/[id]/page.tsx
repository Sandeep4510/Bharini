'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { PublicProfile } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { Avatar, PostCard } from '@/components/artist-post-card';
import { ErrorBanner, errorMessage, primaryButton, secondaryButton } from '@/components/profile-fields';

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
        if (!cancelled && response.data) setProfile(response.data);
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
                <p className="mt-2 text-sm text-slate-300">
                  <strong className="text-white">{profile.follower_count}</strong>{' '}
                  {profile.follower_count === 1 ? 'follower' : 'followers'} ·{' '}
                  <strong className="text-white">{profile.following_count}</strong> following
                </p>
                {profile.bio ? <p className="mt-3 whitespace-pre-line text-slate-200">{profile.bio}</p> : null}
              </div>
              {profile.is_me ? null : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void toggleFollow()}
                  className={`${profile.is_following ? secondaryButton : primaryButton} self-start`}
                >
                  {profile.is_following ? 'Following' : 'Follow'}
                </button>
              )}
            </section>

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
                        posts: profile.posts.map((item) => (item.id === changed.id ? changed : item)),
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
