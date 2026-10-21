'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AuthButton, AuthInput, AuthShell, ShowPasswordToggle, SocialButtons } from '@/components/auth-shell';
import { landingPathFor } from '@/lib/routes';

function SocialError() {
  const error = useSearchParams().get('social_error');
  if (!error) return null;
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {error === 'cancelled'
        ? 'Social sign-in was cancelled.'
        : error === 'not_configured'
          ? 'This sign-in option is not set up yet. Please use your email.'
          : 'Social sign-in failed. Please try again or use your email.'}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const user = await login(email, password);
      router.push(landingPathFor(user));
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
        <Suspense fallback={null}>
          <SocialError />
        </Suspense>
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />
        <AuthInput label="Password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={setPassword} />
        <ShowPasswordToggle checked={showPassword} onChange={setShowPassword} />

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
        <SocialButtons />

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
