'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError } from '@bharini/api-client';

import { useAuth } from '@/components/auth-provider';
import { AuthButton, AuthInput, AuthShell, ShowPasswordToggle, SocialButtons } from '@/components/auth-shell';
import { PasswordChecklist, unmetPasswordRules } from '@/components/password-checklist';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('artist');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const unmet = unmetPasswordRules(password);
    const clientErrors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) clientErrors.email = 'Enter a valid email address, like you@example.com.';
    if (unmet.length) clientErrors.password = `Password needs: ${unmet.join(', ')}.`;
    if (password !== confirmPassword) clientErrors.password_confirm = 'Passwords do not match.';
    if (!acceptTerms) clientErrors.accept_terms = 'Accept the Terms & Conditions to create an account.';
    setFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        email,
        first_name: firstName,
        last_name: lastName,
        role,
        password,
        password_confirm: confirmPassword,
        accept_terms: acceptTerms,
      });

      router.push('/auth/verify-email');
    } catch (caughtError) {
      const serverFieldErrors = caughtError instanceof ApiError ? caughtError.fieldErrors : {};
      setFieldErrors(Object.fromEntries(Object.entries(serverFieldErrors).map(([field, messages]) => [field, messages.join(' ')])));
      setError(caughtError instanceof Error ? caughtError.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Join Bharini as an artist, technician or production house."
    >
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthInput label="First name" placeholder="Aisha" value={firstName} onChange={setFirstName} error={fieldErrors.first_name} />
          <AuthInput label="Last name" placeholder="Sharma" value={lastName} onChange={setLastName} error={fieldErrors.last_name} />
        </div>

        <AuthInput label="Email" type="email" placeholder="you@example.com" value={email} onChange={setEmail} error={fieldErrors.email} />

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">I am signing up as</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-3 text-base text-white outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="artist">Artist / Technician</option>
            <option value="production_house">Production house</option>
          </select>
        </label>

        <AuthInput label="Password" type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={password} onChange={setPassword} error={fieldErrors.password} />
        <PasswordChecklist password={password} />
        <AuthInput label="Confirm password" type={showPassword ? 'text' : 'password'} placeholder="Repeat your password" value={confirmPassword} onChange={setConfirmPassword} error={fieldErrors.password_confirm} />
        <ShowPasswordToggle checked={showPassword} onChange={setShowPassword} />

        <div>
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              aria-invalid={fieldErrors.accept_terms ? true : undefined}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="font-medium text-violet-300 hover:text-violet-200">
                Terms &amp; Conditions
              </Link>
              . If I am under 18, my parent or guardian agrees too.
            </span>
          </label>
          {fieldErrors.accept_terms ? <span className="mt-1.5 block text-sm text-red-300">{fieldErrors.accept_terms}</span> : null}
        </div>

        <AuthButton>{isSubmitting ? 'Creating account...' : 'Create account'}</AuthButton>
        <SocialButtons role={role} />

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
