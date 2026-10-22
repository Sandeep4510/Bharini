'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AuthShell } from '@/components/auth-shell';
import { landingPathFor } from '@/lib/routes';

export default function SocialCallbackPage() {
  const router = useRouter();
  const { loginWithSocialCode } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // the code is single-use; Strict Mode runs effects twice in dev
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.search).get('code') ?? '';
    loginWithSocialCode(code)
      .then((user) => router.replace(landingPathFor(user)))
      .catch((caughtError: unknown) => setError(caughtError instanceof Error ? caughtError.message : 'Sign-in failed.'));
  }, [loginWithSocialCode, router]);

  return (
    <AuthShell title="Signing you in" subtitle="Finishing your Google sign-in.">
      {error ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
          <Link href="/auth/login" className="font-medium text-violet-300 hover:text-violet-200">
            Back to login
          </Link>
        </div>
      ) : (
        <p className="text-sm text-slate-300">One moment…</p>
      )}
    </AuthShell>
  );
}
