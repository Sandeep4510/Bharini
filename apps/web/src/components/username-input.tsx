'use client';

import { useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { Field, errorBorder, inputClass, okBorder } from '@/components/profile-fields';

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

/** Username box: checks availability when the field is left and offers free alternatives. */
export function UsernameInput({
  value,
  savedValue,
  onChange,
  error,
  onError,
}: {
  value: string;
  savedValue: string;
  onChange: (value: string) => void;
  error?: string;
  onError: (error: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [available, setAvailable] = useState(false);

  const check = async () => {
    setAvailable(false);
    setSuggestions([]);
    if (!value) return onError('Choose a username.');
    if (!USERNAME_PATTERN.test(value)) return onError('Use 3-30 lowercase letters, numbers, dots or underscores.');
    if (value === savedValue) return onError('');
    try {
      const response = await apiClient.checkUsername(value);
      const result = response.data;
      if (!result) return;
      setAvailable(result.available);
      setSuggestions(result.suggestions);
      onError(result.available ? '' : `@${value} is taken. Try one of these:`);
    } catch {
      onError('');  // the server checks again on save
    }
  };

  const pick = (suggestion: string) => {
    onChange(suggestion);
    setSuggestions([]);
    setAvailable(true);
    onError('');
  };

  return (
    <Field label="Username" error={error} hint={available ? `✓ @${value} is available` : 'Your public handle, e.g. asha.rao'}>
      <div className="flex">
        <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-700 bg-slate-900 px-3 text-slate-400">@</span>
        <input
          value={value}
          maxLength={30}
          autoComplete="username"
          placeholder="yourname"
          onChange={(event) => {
            setAvailable(false);
            onChange(event.target.value.toLowerCase().replace(/\s/g, ''));
          }}
          onBlur={() => void check()}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} ${error ? errorBorder : okBorder} rounded-l-none`}
        />
      </div>
      {suggestions.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => pick(suggestion)}
              className="rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-sm text-violet-200 hover:bg-violet-500/20"
            >
              @{suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </Field>
  );
}
