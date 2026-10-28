'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { useAuth } from '@/components/auth-provider';
import { AuthShell } from '@/components/auth-shell';
import { errorMessage } from '@/components/profile-fields';
import { landingPathFor } from '@/lib/routes';

/** Landing page of the emailed restore link: undoes a pending account deletion and signs the user in. */
export default function RestoreAccountPage() {
  const router = useRouter();
  const { hydrate } = useAuth();
  const [status, setStatus] = useState('Restoring your account…');
  const started = useRef(false);

  useEffect(() => {
    // the link works once; strict mode would otherwise spend it twice
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid') || '';
    const token = params.get('token') || '';
    const restoring =
      uid && token
        ? apiClient.restoreAccount({ uid, token })
        : Promise.reject(new Error('This restore link is incomplete. Log in again to get a new one.'));
    restoring
      .then(async (response) => {
        const tokens = response.data?.tokens;
        if (!tokens || !response.data) return;
        apiClient.setSession({ accessToken: tokens.access, refreshToken: tokens.refresh });
        await hydrate();
        router.replace(landingPathFor(response.data.user));
      })
      .catch((caughtError) => setStatus(errorMessage(caughtError, 'Could not restore your account.')));
  }, [hydrate, router]);

  return (
    <AuthShell title="Restore account" subtitle="Welcome back. Your account deletion is being cancelled.">
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200">{status}</div>
        <Link
          href="/auth/login"
          className="inline-flex w-full items-center justify-center rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          Go to login
        </Link>
      </div>
    </AuthShell>
  );
}
