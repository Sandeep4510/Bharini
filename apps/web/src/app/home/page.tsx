/* eslint-disable @next/next/no-img-element -- post images are served by the API host */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { Post } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/components/auth-provider';
import { ErrorBanner, errorMessage, fieldErrorsFrom, inputClass, okBorder, primaryButton, secondaryButton } from '@/components/profile-fields';

const BODY_LIMIT = 5000;
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

const smallButton = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50';

/** The home feed only lists the viewer's own posts, so every card can be edited or deleted. */
function PostCard({ post, onChanged, onDeleted }: { post: Post; onChanged: (post: Post) => void; onDeleted: (id: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const [media, setMedia] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setBody(post.body);
    setMedia(null);
    setRemoveMedia(false);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    if (!body.trim()) return setError('Write something to post.');
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.updatePost(post.id, { body: body.trim(), media, removeMedia });
      if (response.data) onChanged(response.data);
      setEditing(false);
    } catch (caughtError) {
      setError(Object.values(fieldErrorsFrom(caughtError))[0] || errorMessage(caughtError, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.deletePost(post.id);
      onDeleted(post.id);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not delete.'));
      setBusy(false);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-slate-400">
          {post.author_name} · {new Date(post.created_at).toLocaleString()}
        </p>
        {!editing ? (
          <div className="flex shrink-0 gap-2">
            {confirmDelete ? (
              <>
                <span className="self-center text-xs text-slate-300">Delete this post?</span>
                <button type="button" disabled={busy} onClick={() => void remove()} className={`${smallButton} bg-red-500/80 text-white hover:bg-red-500`}>
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={`${smallButton} border border-slate-700 text-slate-200`}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={startEditing} className={`${smallButton} border border-slate-700 text-slate-200 hover:border-slate-500`}>
                  Edit
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className={`${smallButton} border border-slate-700 text-slate-200 hover:border-red-400 hover:text-red-200`}>
                  Delete
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-2"><ErrorBanner message={error} /></div> : null}

      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={BODY_LIMIT} rows={4} className={`${inputClass} ${okBorder} resize-y`} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className={`${secondaryButton} cursor-pointer`}>
              {media ? `📎 ${media.name}` : post.media ? '🖼️ Replace image / video' : '🖼️ Add image / video'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(event) => {
                  setMedia(event.target.files?.[0] ?? null);
                  setRemoveMedia(false);
                }}
              />
            </label>
            {post.media && !media ? (
              <label className="inline-flex items-center gap-2 text-slate-300">
                <input type="checkbox" checked={removeMedia} onChange={(event) => setRemoveMedia(event.target.checked)} className="h-4 w-4" />
                Remove attachment
              </label>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} className={primaryButton}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-line text-slate-100">{post.body}</p>
          {post.media && post.media_kind === 'image' ? <img src={post.media} alt="" className="mt-3 max-h-96 rounded-xl object-contain" /> : null}
          {post.media && post.media_kind === 'video' ? <video src={post.media} controls className="mt-3 max-h-96 w-full rounded-xl" /> : null}
        </>
      )}
    </article>
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
              <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Your posts</p>
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
