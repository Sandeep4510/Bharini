'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { Post } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/components/auth-provider';
import { BODY_LIMIT, PostCard } from '@/components/post-card';
import { ErrorBanner, errorMessage, fieldErrorsFrom, inputClass, okBorder, primaryButton, secondaryButton } from '@/components/profile-fields';

const VIDEO_MAX_MB = 100;

function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) return setError('Write something to post.');
    if (media?.type.startsWith('video/') && media.size > VIDEO_MAX_MB * 1024 * 1024) return setError(`Video is too large (max ${VIDEO_MAX_MB} MB).`);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.createPost(body.trim(), media);
      if (response.data) onPosted(response.data);
      setBody('');
      setMedia(null);
      setInputKey((key) => key + 1);
    } catch (caughtError) {
      setError(Object.values(fieldErrorsFrom(caughtError))[0] || errorMessage(caughtError, 'Could not post.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5" noValidate>
      <ErrorBanner message={error} />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={BODY_LIMIT}
        rows={4}
        placeholder="Write an article: a new role, a workshop, a performance…"
        className={`${inputClass} ${okBorder} resize-y`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className={`${secondaryButton} cursor-pointer`}>
          {media ? `📎 ${media.name}` : '🖼️ Add image / video'}
          <input
            key={inputKey}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(event) => setMedia(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    apiClient
      .getPosts()
      .then((response) => {
        if (!cancelled) setPosts(response.data?.posts ?? []);
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiError && caughtError.status === 401) router.replace('/auth/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (user?.role === 'artist' && !user.onboarding_complete) router.replace('/onboarding');
  }, [user, router]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />

        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Share something</h1>
          <Composer onPosted={(post) => setPosts((previous) => [post, ...previous])} />
          {posts.length ? (
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Feed · people you follow first</p>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onChanged={(changed) => setPosts((previous) => previous.map((item) => (item.id === changed.id ? changed : item)))}
                  onDeleted={(id) => setPosts((previous) => previous.filter((item) => item.id !== id))}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Opportunities for you</h2>
          {/* shortcut: no opportunities exist yet; matched-then-other opportunities render here once casting calls ship */}
          <div className="rounded-3xl border border-dashed border-slate-700 px-6 py-16 text-center">
            <p className="text-3xl">🎬</p>
            <p className="mt-3 text-lg text-slate-200">You read everything, come back for more.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
