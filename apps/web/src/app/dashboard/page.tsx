'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, ProfileOptions } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/components/auth-provider';
import { CompletionBar } from '@/components/completion-bar';
import { ageFrom } from '@/components/dob-input';
import { PhotoChangeButton } from '@/components/photo-change-button';
import { AboutWithStatsFor } from '@/components/follow-stats';
import { PortfolioEditor } from '@/components/portfolio-editor';
import { ErrorBanner, secondaryButton } from '@/components/profile-fields';
import { useArtistProfile } from '@/components/use-artist-profile';

function formatHeight(cm: number | null) {
  if (!cm) return null;
  const inches = Math.round(cm / 2.54);
  return `${cm} cm · ${Math.floor(inches / 12)}′${inches % 12}″`;
}

function labelOf(options: ProfileOptions['languages'], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
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
      <PhotoChangeButton
        src={profile.profile_photo}
        alt={name}
        fallback={name.charAt(0).toUpperCase()}
        upload={async (file) => {
          const body = new FormData();
          body.append('profile_photo', file);
          const response = await apiClient.updateProfile(body);
          if (response.data) onProfile(response.data);
        }}
      />
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
            {user ? <AboutWithStatsFor userId={user.id} bio={profile.bio} /> : null}
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
