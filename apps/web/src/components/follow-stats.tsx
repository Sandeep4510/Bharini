'use client';

import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { FollowListDialog } from '@/components/people-dialogs';

/** Follower / following counts as two stat tiles; clicking one lists the people in a pop-up. */
export function FollowStats({ userId, followers, following }: { userId: number; followers: number; following: number }) {
  const [open, setOpen] = useState<'followers' | 'following' | null>(null);
  const tiles = [
    { which: 'followers' as const, count: followers, label: followers === 1 ? 'Follower' : 'Followers' },
    { which: 'following' as const, count: following, label: 'Following' },
  ];

  return (
    <section aria-label="Followers and following" className="grid grid-cols-2 gap-3 sm:max-w-sm">
      {tiles.map((tile) => (
        <button
          key={tile.which}
          type="button"
          onClick={() => setOpen(tile.which)}
          aria-haspopup="dialog"
          className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-center transition hover:border-violet-400/60"
        >
          <span className="block text-2xl font-semibold text-white">{tile.count}</span>
          <span className="block text-xs uppercase tracking-[0.16em] text-slate-400">{tile.label}</span>
        </button>
      ))}
      {open ? <FollowListDialog userId={userId} which={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/** "About me" on the left, follower / following counts on its right (stacked below on phones). */
export function AboutWithStats({
  userId,
  bio,
  counts,
  emptyText,
}: {
  userId: number;
  bio: string;
  counts: { followers: number; following: number } | null;
  emptyText: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-slate-400">About me</h2>
        <p className={`mt-2 whitespace-pre-line ${bio ? 'text-slate-200' : 'text-sm text-slate-400'}`}>{bio || emptyText}</p>
      </section>
      {counts ? <FollowStats userId={userId} followers={counts.followers} following={counts.following} /> : null}
    </div>
  );
}

/** Your own About me plus counts loaded for your account, for the dashboard. */
export function AboutWithStatsFor({ userId, bio }: { userId: number; bio: string }) {
  const [counts, setCounts] = useState<{ followers: number; following: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getUserProfile(userId)
      .then((response) => {
        if (!cancelled && response.data) setCounts({ followers: response.data.follower_count, following: response.data.following_count });
      })
      .catch(() => undefined); // counts are extra; the page works without them
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return <AboutWithStats userId={userId} bio={bio} counts={counts} emptyText="Tell casting teams about yourself: use Edit profile to add your About me." />;
}
