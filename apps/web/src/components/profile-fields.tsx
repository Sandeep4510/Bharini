import type { FocusEvent, ReactNode } from 'react';

import { ApiError } from '@bharini/api-client';
import type { Option } from '@bharini/types';

export const inputClass =
  'w-full rounded-xl border bg-slate-950/70 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:ring-2';
export const okBorder = 'border-slate-700 focus:border-violet-400 focus:ring-violet-500/20';
export const errorBorder = 'border-red-500 focus:border-red-400 focus:ring-red-500/20';
export const primaryButton =
  'inline-flex items-center justify-center rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton =
  'inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

/** Flattens DRF field errors (strings, lists or nested lists) into one message per field. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.fieldErrors) return {};
  const flatten = (value: unknown): string[] =>
    typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? Object.values(value).flatMap(flatten) : [];
  return Object.fromEntries(Object.entries(error.fieldErrors).map(([field, value]) => [field, flatten(value).join(' ')]));
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{message}</div>;
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1.5 block text-xs text-slate-400">{hint}</span> : null}
      {error ? <span className="mt-1.5 block text-sm text-red-300">{error}</span> : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? errorBorder : okBorder}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  error?: string;
}) {
  return (
    <Field label={label} error={error} hint={`${value.length}/${maxLength}`}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={4}
        aria-invalid={error ? true : undefined}
        className={`${inputClass} ${error ? errorBorder : okBorder} resize-y`}
      />
    </Field>
  );
}

/** onBlur handler for a field group: runs `check` only when focus leaves the whole group. */
export function onLeave(check: () => void) {
  return (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) check();
  };
}
