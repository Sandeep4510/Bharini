'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AuthButton, AuthInput, AuthShell } from '@/components/auth-shell';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Login"
      subtitle="Welcome back. Sign in to continue your artist or production journey."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <AuthInput label="Password" type="password" placeholder="••••••••" value={password} onChange={setPassword} />

        <div className="flex items-center justify-between text-sm">
          <label className="inline-flex items-center gap-2 text-slate-300">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-600 bg-slate-950" />
            Remember me
          </label>
          <Link href="/auth/forgot-password" className="text-violet-300 hover:text-violet-200">
            Forgot password?
          </Link>
        </div>

        <AuthButton>{isSubmitting ? 'Signing in...' : 'Sign in'}</AuthButton>

        <p className="text-center text-sm text-slate-300">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="font-medium text-violet-300 hover:text-violet-200">
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
