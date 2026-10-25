/* eslint-disable @next/next/no-img-element -- profile photos are served by the API host */
'use client';

import Link from 'next/link';

import type { ArtistDirectoryProfile } from '@bharini/types';

export function ArtistCard({ artist }: { artist: ArtistDirectoryProfile }) {
  return (
    <Link
      href={`/u/${artist.user_id}`}
      className="block rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-violet-400/60 hover:bg-slate-900"
    >
      <div className="flex items-center gap-3">
        {artist.profile_photo ? (
          <img src={artist.profile_photo} alt={artist.display_name} className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
            {artist.display_name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{artist.display_name}</p>
          <p className="truncate text-xs text-slate-400">@{artist.username ?? 'artist'}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-200">{artist.disciplines.join(' · ')}</p>
      {artist.location ? <p className="mt-1 text-xs text-slate-400">{artist.location}</p> : null}
    </Link>
  );
}
