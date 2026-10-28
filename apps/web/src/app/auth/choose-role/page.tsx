'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';

import { useAuth } from '@/components/auth-provider';
import { AuthButton, AuthShell } from '@/components/auth-shell';
import { errorMessage } from '@/components/profile-fields';
import { landingPathFor } from '@/lib/routes';

const ROLES = [
  { value: 'artist' as const, label: 'Artist / Technician', hint: 'Actor, singer, musician, dancer, director, cameraman…' },
  { value: 'production_house' as const, label: 'Production house', hint: 'Studios and producers who cast talent' },
];

/** First stop after a Google sign-up that started on the login page: pick the account type once. */
export default function ChooseRolePage() {
  const router = useRouter();
  const { hydrate } = useAuth();
  const [role, setRole] = useState<'artist' | 'production_house' | ''>('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role) return setError('Choose one to continue.');
    setError('');
    try {
      const response = await apiClient.chooseRole(role);
      await hydrate();
      if (response.data) router.replace(landingPathFor(response.data));
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not save your choice.'));
    }
  };

  return (
    <AuthShell title="Welcome to Bharini" subtitle="How will you use Bharini? You can't change this later.">
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="sr-only">Account type</legend>
          {ROLES.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                role === option.value ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="mt-1 h-4 w-4 accent-violet-500"
              />
              <span>
                <span className="block font-semibold text-white">{option.label}</span>
                <span className="block text-sm text-slate-400">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <AuthButton>Continue</AuthButton>
      </form>
    </AuthShell>
  );
}
