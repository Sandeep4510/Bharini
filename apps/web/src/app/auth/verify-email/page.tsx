'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { AuthButton, AuthShell } from '@/components/auth-shell';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState('Check your inbox and click the verification link to activate your account.');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid') || '';
    const token = params.get('token') || '';

    const verify = async () => {
      if (!uid || !token) {
        setStatus('We have sent a verification email. Please open the link in your inbox to continue.');
        return;
      }

      try {
        setIsSubmitting(true);
        const response = await apiClient.verifyEmail({ uid, token });
        setStatus(response.message || 'Email verified successfully.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Verification failed');
      } finally {
        setIsSubmitting(false);
      }
    };

    void verify();
  }, []);

  return (
    <AuthShell
      title="Email verification"
      subtitle="Confirm your account from your email link to unlock access to Bharini."
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-200">
          {status}
        </div>

        {isSubmitting ? (
          <AuthButton>Verifying...</AuthButton>
        ) : (
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Go to login
          </Link>
        )}
      </div>
    </AuthShell>
  );
}
