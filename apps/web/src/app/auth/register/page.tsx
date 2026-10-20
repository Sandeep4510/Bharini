'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { AuthButton, AuthInput, AuthShell } from '@/components/auth-shell';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('artist');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await register({
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        password,
        password_confirm: confirmPassword,
      });

      router.push('/auth/verify-email');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Join Bharini as an artist or a production house."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthInput label="First name" placeholder="Aisha" value={firstName} onChange={setFirstName} />
          <AuthInput label="Last name" placeholder="Sharma" value={lastName} onChange={setLastName} />
        </div>

        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} />

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">I am signing up as</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-3 text-base text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="artist">Artist</option>
            <option value="production_house">Production house</option>
          </select>
        </label>

        <AuthInput label="Password" type="password" placeholder="Create a strong password" value={password} onChange={setPassword} />
        <AuthInput label="Confirm password" type="password" placeholder="Repeat your password" value={confirmPassword} onChange={setConfirmPassword} />

        <AuthButton>{isSubmitting ? 'Creating account...' : 'Create account'}</AuthButton>

        <p className="text-center text-sm text-slate-300">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-violet-300 hover:text-violet-200">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
