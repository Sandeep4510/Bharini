'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { UserSummary } from '@bharini/types';

import { Avatar } from '@/components/artist-post-card';
import { errorMessage, inputClass, okBorder, primaryButton } from '@/components/profile-fields';
import { profileHref } from '@/lib/routes';

function PersonRow({ person }: { person: UserSummary }) {
  return (
    <Link href={profileHref(person)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-800/60">
      <Avatar user={person} size="h-9 w-9" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{person.name}</span>
        <span className="block truncate text-xs text-slate-400">
          {person.username ? `@${person.username}` : person.role === 'production_house' ? 'Production house' : 'Artist'}
        </span>
      </span>
    </Link>
  );
}

/** Pop-up list of an account's followers or the accounts it follows. */
export function FollowListDialog({ userId, which, onClose }: { userId: number; which: 'followers' | 'following'; onClose: () => void }) {
  const [people, setPeople] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getFollowList(userId, which)
      .then((response) => {
        if (!cancelled) setPeople(response.data?.people ?? []);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(errorMessage(caughtError, 'Could not load this list.'));
      });
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [userId, which, onClose]);

  const title = which === 'followers' ? 'Followers' : 'Following';
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {people === null && !error ? <p className="text-sm text-slate-400">Loading…</p> : null}
        {people?.length === 0 ? <p className="text-sm text-slate-400">{which === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p> : null}
        <ul className="max-h-80 overflow-y-auto">
          {people?.map((person) => (
            <li key={person.id}>
              <PersonRow person={person} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Search bar for finding any artist or production house by name or username. */
export function PeopleSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return setResults(null);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.searchPeople(query.trim());
      setResults(response.data?.results ?? []);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not search.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2">
      <form onSubmit={search} role="search" className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value) setResults(null);
          }}
          maxLength={100}
          placeholder="Search artists and production houses"
          aria-label="Search artists and production houses"
          className={`${inputClass} ${okBorder} min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? '…' : 'Search'}
        </button>
      </form>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {results ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
          {results.length ? (
            <ul>
              {results.map((person) => (
                <li key={person.id}>
                  <PersonRow person={person} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-sm text-slate-400">No one matches “{query.trim()}”.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
