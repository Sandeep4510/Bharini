'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';

import { AuthButton, AuthInput, AuthShell } from '@/components/auth-shell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setNotFound(false);
    setIsSubmitting(true);

    try {
      const response = await apiClient.requestPasswordReset({ email });
      setMessage(response.message || 'Reset instructions sent.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send reset email');
      setNotFound(caughtError instanceof ApiError && caughtError.status === 404);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="Enter your email to receive a secure reset link."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {message ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
            {notFound ? (
              <>
                {' '}
                <Link href="/auth/register" className="font-medium text-violet-300 underline hover:text-violet-200">
                  Create an account
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <AuthButton>{isSubmitting ? 'Sending...' : 'Send reset link'}</AuthButton>

        <p className="text-center text-sm text-slate-300">
          <Link href="/auth/login" className="font-medium text-violet-300 hover:text-violet-200">
            Back to login
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
