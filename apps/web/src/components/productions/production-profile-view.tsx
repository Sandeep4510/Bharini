'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { Production } from '@bharini/types';

import { PostComposer } from '@/components/post-composer';
import { EMPTY_PAGE, PostList } from '@/components/post-list';

export function ProductionProfileView({ productionId }: { productionId: number }) {
  const [production, setProduction] = useState<Production | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!production) return <p className="text-sm text-slate-400">Loading profile…</p>;

  const made = production.title_credits.filter((credit) => credit.role === 'made');
  const partOf = production.title_credits.filter((credit) => credit.role === 'part_of');

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-gradient-to-br from-violet-600/10 via-slate-900 to-slate-950 p-5 sm:p-7">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
              {production.name.charAt(0).toUpperCase()}
            </span>
            <span>{production.kind === 'house' ? 'Production house' : 'Producer profile'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {production.profile_picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- media is served by the Django backend, not optimized by Next
              <img
                src={production.profile_picture}
                alt={production.name}
                className="h-24 w-24 rounded-full border-2 border-violet-500/40 object-cover shadow-lg shadow-violet-500/10"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-violet-500 text-3xl font-semibold text-white shadow-lg shadow-violet-500/20">
                {production.name.charAt(0).toUpperCase()}
              </span>
            )}

            <div className="space-y-2">
              <p className="text-sm uppercase tracking-[0.18em] text-violet-300">
                {production.kind === 'house' ? 'Production house' : 'Individual producer'}
              </p>
              <h1 className="text-3xl font-semibold text-white">{production.name}</h1>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {made.length > 0 ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1">
                    {made.length} titles made
                  </span>
                ) : null}
                {partOf.length > 0 ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1">
                    {partOf.length} collaborations
                  </span>
                ) : null}
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 space-y-2 border-t border-slate-800 pt-5">
          {made.length > 0 && <TitleList label="Made" titles={made} />}
          {partOf.length > 0 && <TitleList label="Part of" titles={partOf} />}
        </div>
      </section>

      {production.is_owner && <PostComposer onPosted={() => setRefreshKey((key) => key + 1)} />}

      <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-5 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Recent posts</h2>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Updates</span>
        </div>
        <PostList loadPage={loadPage} refreshKey={refreshKey} emptyText="No posts yet." />
      </div>
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
