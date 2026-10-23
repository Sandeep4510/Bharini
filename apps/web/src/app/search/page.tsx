'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { ArtistDirectoryFilters, ArtistDirectoryProfile, ProfileOptions } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { ArtistCard } from '@/components/artist-card';
import { Field, errorMessage, inputClass, okBorder, primaryButton } from '@/components/profile-fields';

const EMPTY_FILTERS = { discipline: '', ageMin: '', ageMax: '', gender: '', language: '' };

type Filters = typeof EMPTY_FILTERS;
type ExtraFilter = 'age' | 'gender' | 'language';

// Filters shown once an artist type is chosen; musician's instrument filter waits on profile data.
const EXTRA_FILTERS: Record<string, ExtraFilter[]> = {
  actor: ['age', 'gender', 'language'],
  singer: ['gender'],
  musician: [],
  choreographer: [],
  director: [],
};

function toApiFilters(filters: Filters): ArtistDirectoryFilters {
  const extras = EXTRA_FILTERS[filters.discipline] ?? [];
  return {
    discipline: filters.discipline || undefined,
    age_min: extras.includes('age') && filters.ageMin ? Number(filters.ageMin) : undefined,
    age_max: extras.includes('age') && filters.ageMax ? Number(filters.ageMax) : undefined,
    gender: extras.includes('gender') && filters.gender ? filters.gender : undefined,
    language: extras.includes('language') && filters.language ? filters.language : undefined,
  };
}

export default function SearchPage() {
  const router = useRouter();
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [artists, setArtists] = useState<ArtistDirectoryProfile[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) router.replace('/auth/login');
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    apiClient.getProfileOptions().then((res) => {
      if (!cancelled) setOptions(res.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .listArtistProfiles(toApiFilters(applied))
      .then((res) => {
        if (cancelled) return;
        setArtists(res.data?.results ?? []);
        setError('');
      })
      .catch((caught) => {
        if (cancelled) return;
        setArtists([]);
        setError(errorMessage(caught, 'Could not load artists.'));
      })
      .finally(() => {
        if (!cancelled) setSearched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [applied]);

  const updateDraft = (key: keyof Filters, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  // changing the artist type drops filters that belonged to the previous type
  const chooseType = (discipline: string) => setDraft({ ...EMPTY_FILTERS, discipline });

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApplied(draft);
  };

  const extras = EXTRA_FILTERS[draft.discipline] ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />

        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Search your Artist</h1>
          <form
            onSubmit={search}
            className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:grid-cols-2"
            noValidate
          >
            <Field label="Artist type">
              <select
                value={draft.discipline}
                onChange={(event) => chooseType(event.target.value)}
                className={`${inputClass} ${okBorder}`}
              >
                <option value="">All</option>
                {options?.disciplines.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {extras.includes('age') && (
              <>
                <Field label="Min age">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={draft.ageMin}
                    onChange={(event) => updateDraft('ageMin', event.target.value)}
                    className={`${inputClass} ${okBorder}`}
                  />
                </Field>
                <Field label="Max age">
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={draft.ageMax}
                    onChange={(event) => updateDraft('ageMax', event.target.value)}
                    className={`${inputClass} ${okBorder}`}
                  />
                </Field>
              </>
            )}

            {extras.includes('gender') && (
              <Field label="Gender">
                <select
                  value={draft.gender}
                  onChange={(event) => updateDraft('gender', event.target.value)}
                  className={`${inputClass} ${okBorder}`}
                >
                  <option value="">Any</option>
                  {options?.genders.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {extras.includes('language') && (
              <Field label="Language">
                <select
                  value={draft.language}
                  onChange={(event) => updateDraft('language', event.target.value)}
                  className={`${inputClass} ${okBorder}`}
                >
                  <option value="">Any</option>
                  {options?.languages.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className={primaryButton}>
                Search
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-3">
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          {!searched ? (
            <p className="text-sm text-slate-400">Loading artists…</p>
          ) : artists.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {artists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No artist profiles match.</p>
          )}
        </section>
      </div>
    </main>
  );
}
