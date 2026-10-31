import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, ProfileOptions } from '@bharini/types';

import { messageOf } from '@/lib/config';

/** Your artist profile plus the choice lists (disciplines, languages, …) from /profile/ and /profile/options/. */
export function useArtistProfile() {
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getProfile(), apiClient.getProfileOptions()])
      .then(([profileResponse, optionsResponse]) => {
        if (cancelled) return;
        setProfile(profileResponse.data ?? null);
        setOptions(optionsResponse.data ?? null);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) setError(messageOf(caughtError, 'Could not load your profile.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, setProfile, options, error };
}
