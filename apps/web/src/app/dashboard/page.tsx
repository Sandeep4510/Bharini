/* eslint-disable @next/next/no-img-element -- profile photo is served by the API host */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, ProfileOptions } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/components/auth-provider';
import { CompletionBar } from '@/components/completion-bar';
import { PortfolioEditor } from '@/components/portfolio-editor';
import { ErrorBanner, errorMessage, fieldErrorsFrom, secondaryButton } from '@/components/profile-fields';
import { useArtistProfile } from '@/components/use-artist-profile';

function ageFrom(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  const today = new Date();
  const hadBirthday = today.getMonth() > born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  return today.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

function formatHeight(cm: number | null) {
  if (!cm) return null;
  const inches = Math.round(cm / 2.54);
  return `${cm} cm · ${Math.floor(inches / 12)}′${inches % 12}″`;
}

function labelOf(options: ProfileOptions['languages'], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

const PHOTO_MAX_MB = 8;

/** Click the photo to replace it straight away; the server face-checks it like in onboarding. */
function ProfilePhotoButton({ profile, name, onProfile }: { profile: ArtistProfile; name: string; onProfile: (profile: ArtistProfile) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) return setError(`Photo is too large (max ${PHOTO_MAX_MB} MB).`);
    const body = new FormData();
    body.append('profile_photo', file);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.updateProfile(body);
      if (response.data) onProfile(response.data);
    } catch (caughtError) {
      setError(fieldErrorsFrom(caughtError).profile_photo || errorMessage(caughtError, 'Could not change photo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Change profile picture"
        aria-label="Change profile picture"
        className="group relative block h-28 w-28 overflow-hidden rounded-full border-2 border-violet-500/60 bg-slate-950"
      >
        {profile.profile_photo ? <img src={profile.profile_photo} alt={name} className="h-full w-full object-cover" /> : null}
        <span
          className={`absolute inset-0 flex items-center justify-center bg-slate-950/60 text-xs font-semibold text-white transition ${
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        >
          {busy ? 'Uploading…' : '📷 Change'}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      {error ? <p className="mt-2 max-w-48 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function ProfileHeader({
  profile,
  options,
  name,
  onProfile,
}: {
  profile: ArtistProfile;
  options: ProfileOptions;
  name: string;
  onProfile: (profile: ArtistProfile) => void;
}) {
  const facts = [ageFrom(profile.date_of_birth) && `${ageFrom(profile.date_of_birth)} yrs`, labelOf(options.genders, profile.gender), formatHeight(profile.height_cm), profile.location && `📍 ${profile.location}`].filter(Boolean);

  return (
    <div className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 sm:flex-row sm:items-center">
      <ProfilePhotoButton profile={profile} name={name} onProfile={onProfile} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          {profile.disciplines.map((discipline) => (
            <span key={discipline} className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-0.5 text-xs font-medium uppercase tracking-[0.14em] text-violet-200">
              {labelOf(options.disciplines, discipline)}
            </span>
          ))}
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-white">{name}</h1>
        {profile.username ? <p className="mt-1 text-slate-300">@{profile.username}</p> : null}
        <p className="mt-2 text-sm text-slate-400">{facts.join(' · ')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.languages.map((item) => (
            <span key={item.language} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
              {labelOf(options.languages, item.language)} <span className="text-slate-400">· {labelOf(options.language_levels, item.level)}</span>
            </span>
          ))}
        </div>
        {profile.instruments.length ? <p className="mt-2 text-sm text-slate-300">🎵 {profile.instruments.join(', ')}</p> : null}
      </div>
      <Link href="/onboarding" className={`${secondaryButton} self-start`}>
        Edit profile
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, setProfile, options, notArtist, error } = useArtistProfile();

  useEffect(() => {
    if (profile && !profile.onboarding_complete) router.replace('/onboarding');
  }, [profile, router]);

  const name = user ? `${user.first_name} ${user.last_name}` : '';

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader />

        {error ? <ErrorBanner message={error} /> : null}

        {notArtist ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-sm uppercase tracking-[0.16em] text-violet-300">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">Welcome to Bharini</h1>
            <p className="mt-4 text-slate-300">{user ? `Signed in as ${name} (${user.email}).` : 'Your session is active.'}</p>
          </div>
        ) : profile && options && profile.onboarding_complete ? (
          <>
            <ProfileHeader profile={profile} options={options} name={name} onProfile={setProfile} />
            <CompletionBar percent={profile.completion_percent} />
            <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
              <PortfolioEditor profile={profile} onProfile={setProfile} />
            </div>
          </>
        ) : !error ? (
          <p className="py-20 text-center text-slate-300">Loading your profile…</p>
        ) : null}
      </div>
    </main>
  );
}
