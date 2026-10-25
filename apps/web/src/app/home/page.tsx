/* eslint-disable @next/next/no-img-element -- post images are served by the API host */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { ArtistDirectoryProfile, ArtistPost, Production } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { PostCard, replacePost } from '@/components/artist-post-card';
import { ArtistCard } from '@/components/artist-card';
import { useAuth } from '@/components/auth-provider';
import { ArtistHome } from '@/components/artist-home';
import {
  ErrorBanner,
  errorMessage,
  fieldErrorsFrom,
  inputClass,
  okBorder,
  primaryButton,
  secondaryButton,
} from '@/components/profile-fields';

const BODY_LIMIT = 5000;
const VIDEO_MAX_MB = 100;

function Composer({ onPosted }: { onPosted: (post: ArtistPost) => void }) {
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) return setError('Write something to post.');
    if (media?.type.startsWith('video/') && media.size > VIDEO_MAX_MB * 1024 * 1024)
      return setError(`Video is too large (max ${VIDEO_MAX_MB} MB).`);
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

function ProductionHome() {
  const router = useRouter();
  const { user } = useAuth();
  const isProductionHouse = user?.role === 'production_house';
  const [posts, setPosts] = useState<ArtistPost[]>([]);
  const [production, setProduction] = useState<Production | null>(null);
  const [artists, setArtists] = useState<ArtistDirectoryProfile[]>([]);
  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    Promise.allSettled([apiClient.getPosts(), apiClient.getMyProduction(), apiClient.listArtistProfiles()]).then(
      (results) => {
        if (cancelled) return;
        const [postsResult, productionResult, artistsResult] = results;

        if (postsResult.status === 'fulfilled') {
          setPosts(postsResult.value.data?.posts ?? []);
        } else if (postsResult.reason instanceof ApiError && postsResult.reason.status === 401) {
          router.replace('/auth/login');
        }

        if (productionResult.status === 'fulfilled') {
          setProduction(productionResult.value.data ?? null);
        }

        if (artistsResult.status === 'fulfilled') {
          setArtists(artistsResult.value.data?.results ?? []);
        }
      },
    );
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
        <AppHeader greet />

        {isProductionHouse ? null : (
          <section className="space-y-3 rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">My Profile</h1>
              <Link href="/productions/me" className={secondaryButton}>
                Open profile
              </Link>
            </div>

            {production ? (
              <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center gap-3">
                  {production.profile_picture ? (
                    <img
                      src={production.profile_picture}
                      alt={production.name}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500 text-xl font-semibold text-white">
                      {production.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-violet-300">
                      {production.kind === 'house' ? 'Production house' : 'Individual producer'}
                    </p>
                    <p className="text-lg font-semibold text-white">{production.name}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <p>
                    <span className="font-semibold text-slate-100">Movies worked:</span>{' '}
                    {formatTitleCredits(production, 'movie')}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-100">Serials worked:</span>{' '}
                    {formatTitleCredits(production, 'serial')}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-300">
                Set up your production house profile with name, photo, and movie/serial credits.
              </p>
            )}
          </section>
        )}

        {/*<section className="space-y-3">*/}
        {/*  {artists.length ? (*/}
        {/*    <div className="grid gap-3 sm:grid-cols-2">*/}
        {/*      {artists.map((artist) => (*/}
        {/*        <ArtistCard key={artist.id} artist={artist} />*/}
        {/*      ))}*/}
        {/*    </div>*/}
        {/*  ) : (*/}
        {/*    <p className="text-sm text-slate-400">No artist profiles match.</p>*/}
        {/*  )}*/}
        {/*</section>*/}

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Share something</h2>
          <Composer onPosted={(post) => setPosts((previous) => [post, ...previous])} />
          {posts.length ? (
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.16em] text-slate-400">Feed · people you follow first</p>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onChanged={(changed) => setPosts((previous) => replacePost(previous, changed))}
                  onDeleted={(id) => setPosts((previous) => previous.filter((item) => item.id !== id))}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function formatTitleCredits(production: Production, kind: 'movie' | 'serial') {
  const items = production.title_credits.filter((credit) => credit.kind === kind);
  if (!items.length) return '—';
  return items.map((item) => `${item.name}${item.release_year ? ` (${item.release_year})` : ''}`).join(', ');
}

export default function HomePage() {
  const { user } = useAuth();
  return user?.role === 'artist' ? <ArtistHome /> : <ProductionHome />;
}
