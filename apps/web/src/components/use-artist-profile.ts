'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { ArtistProfile, ProfileOptions } from '@bharini/types';

import { errorMessage } from '@/components/profile-fields';

/** Loads the signed-in artist's profile and form options; sends logged-out visitors to login. */
export function useArtistProfile() {
  const router = useRouter();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [notArtist, setNotArtist] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }

    let cancelled = false;
    Promise.all([apiClient.getProfile(), apiClient.getProfileOptions()])
      .then(([profileResponse, optionsResponse]) => {
        if (cancelled) return;
        setProfile(profileResponse.data ?? null);
        setOptions(optionsResponse.data ?? null);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        if (caughtError instanceof ApiError && caughtError.status === 401) {
          router.replace('/auth/login');
        } else if (caughtError instanceof ApiError && caughtError.status === 403) {
          setNotArtist(true);
        } else {
          setError(errorMessage(caughtError, 'Could not load your profile.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { profile, setProfile, options, notArtist, error };
}
