'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { AuthButton, AuthInput, AuthShell } from '@/components/auth-shell';
import { PasswordChecklist } from '@/components/password-checklist';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);

    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid') || '';
    const token = params.get('token') || '';

    try {
      const response = await apiClient.confirmPasswordReset({
        uid,
        token,
        password,
        password_confirm: confirmPassword,
      });

      setMessage(response.message || 'Password reset successful');
      router.push('/auth/login');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Password reset failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="New password"
      subtitle="Create a new secure password for your Bharini account."
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
          </div>
        ) : null}

        <AuthInput label="New password" type="password" placeholder="New password" value={password} onChange={setPassword} />
        <PasswordChecklist password={password} />
        <AuthInput label="Confirm password" type="password" placeholder="Repeat new password" value={confirmPassword} onChange={setConfirmPassword} />
        <AuthButton>{isSubmitting ? 'Updating...' : 'Update password'}</AuthButton>

        <p className="text-center text-sm text-slate-300">
          <Link href="/auth/login" className="font-medium text-violet-300 hover:text-violet-200">
            Back to login
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
