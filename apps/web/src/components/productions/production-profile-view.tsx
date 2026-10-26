'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { Production } from '@bharini/types';

import { ConnectButton } from '@/components/connect-button';
import { FollowStats } from '@/components/follow-stats';
import { primaryButton, secondaryButton } from '@/components/profile-fields';
import { PostComposer } from '@/components/post-composer';
import { PhotoChangeButton } from '@/components/photo-change-button';
import { EMPTY_PAGE, PostList } from '@/components/post-list';

export function ProductionProfileView({ productionId }: { productionId: number }) {
  const [production, setProduction] = useState<Production | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getProduction(productionId)
      .then((res) => active && res.data && setProduction(res.data))
      .catch((err: Error) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [productionId]);

  const loadPage = useCallback(
    (cursor: string | null) =>
      apiClient.listProductionPosts(productionId, cursor).then((res) => res.data ?? EMPTY_PAGE),
    [productionId],
  );

  const toggleFollow = async () => {
    if (!production) return;
    setFollowBusy(true);
    try {
      const response = await apiClient.setFollow(production.owner_id, !production.is_following);
      if (response.data) setProduction({ ...production, ...response.data });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFollowBusy(false);
    }
  };

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!production) return <p className="text-sm text-slate-400">Loading profile…</p>;

  const made = production.title_credits.filter((credit) => credit.role === 'made');
  const partOf = production.title_credits.filter((credit) => credit.role === 'part_of');

  const kindLabel = production.kind === 'house' ? 'Production house' : 'Individual producer';

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:flex-row sm:items-center">
        {production.is_owner ? (
          <PhotoChangeButton
            src={production.profile_picture}
            alt={production.name}
            fallback={production.name.charAt(0).toUpperCase()}
            upload={async (file) => {
              const body = new FormData();
              body.append('profile_picture', file);
              const response = await apiClient.updateProduction(production.id, body);
              if (response.data) setProduction(response.data);
            }}
          />
        ) : (
          <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-violet-500/60 bg-slate-950">
            {production.profile_picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- media is served by the Django backend, not optimized by Next
              <img src={production.profile_picture} alt={production.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-violet-500 text-3xl font-semibold text-white">
                {production.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-0.5 text-xs font-medium uppercase tracking-[0.14em] text-violet-200">
            {kindLabel}
          </span>
          <h1 className="mt-2 text-3xl font-semibold text-white">{production.name}</h1>
          {made.length || partOf.length ? (
            <p className="mt-2 text-sm text-slate-400">
              {[made.length && `${made.length} titles made`, partOf.length && `${partOf.length} collaborations`].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>

        {production.is_owner ? null : (
          <div className="flex flex-wrap gap-2 self-start">
            <ConnectButton
              userId={production.owner_id}
              status={production.connection}
              onChange={(connection) => setProduction({ ...production, connection })}
            />
            {production.connection === 'connected' ? (
              <Link href={`/messages?with=${production.owner_id}`} className={secondaryButton}>
                Message
              </Link>
            ) : null}
            <button
              type="button"
              disabled={followBusy}
              onClick={() => void toggleFollow()}
              className={production.is_following ? secondaryButton : primaryButton}
            >
              {production.is_following ? 'Following' : 'Follow'}
            </button>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">Work</h2>
          <div className="mt-2 space-y-2">
            {made.length > 0 && <TitleList label="Made" titles={made} />}
            {partOf.length > 0 && <TitleList label="Part of" titles={partOf} />}
            {made.length || partOf.length ? null : <p className="text-sm text-slate-400">No titles added yet.</p>}
          </div>
        </section>
        <FollowStats userId={production.owner_id} followers={production.follower_count} following={production.following_count} />
      </div>

      {production.is_owner && <PostComposer onPosted={() => setRefreshKey((key) => key + 1)} />}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Posts</h2>
        <PostList loadPage={loadPage} refreshKey={refreshKey} emptyText="No posts yet." />
      </section>
    </div>
  );
}

function TitleList({ label, titles }: { label: string; titles: Production['title_credits'] }) {
  return (
    <p className="text-sm text-slate-300">
      <span className="font-semibold text-slate-100">{label}:</span>{' '}
      {titles.map((title) => `${title.name}${title.release_year ? ` (${title.release_year})` : ''}`).join(', ')}
    </p>
  );
}
