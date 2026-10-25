'use client';

import { useRef, useState, type ReactNode } from 'react';

import type { ArtistProfile } from '@bharini/types';

import { errorMessage, fieldErrorsFrom } from '@/components/profile-fields';

/** One upload slot: shows the current file (or a placeholder), uploads, replaces and removes. */
export function UploadCard({
  title,
  subtitle,
  accept,
  filled,
  preview,
  placeholder,
  check,
  onUpload,
  onRemove,
  onProfile,
}: {
  title: string;
  subtitle: string;
  accept: string;
  filled: boolean;
  preview: ReactNode;
  placeholder: ReactNode;
  check?: (file: File) => Promise<string | null>;
  onUpload: (file: File) => Promise<{ data?: ArtistProfile }>;
  onRemove: () => Promise<{ data?: ArtistProfile }>;
  onProfile: (profile: ArtistProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'uploading' | 'removing'>('');
  const [error, setError] = useState('');

  const run = async (kind: 'uploading' | 'removing', action: () => Promise<{ data?: ArtistProfile }>) => {
    setBusy(kind);
    setError('');
    try {
      const response = await action();
      if (response.data) onProfile(response.data);
    } catch (caughtError) {
      setError(fieldErrorsFrom(caughtError).file || errorMessage(caughtError, 'Upload failed.'));
    } finally {
      setBusy('');
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const problem = check ? await check(file) : null;
    if (problem) {
      setError(problem);
      return;
    }
    await run('uploading', () => onUpload(file));
  };

  return (
    <div className={`flex min-w-0 flex-col rounded-2xl border p-3 ${filled ? 'border-violet-500/40 bg-slate-900/70' : 'border-dashed border-slate-700 bg-slate-950/40'}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="min-w-0 truncate font-medium text-white">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>

      <div className="flex-1">{filled ? preview : placeholder}</div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
          className="min-w-0 flex-1 truncate rounded-lg bg-violet-500/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {busy === 'uploading' ? 'Uploading…' : filled ? 'Replace' : 'Upload'}
        </button>
        {filled ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run('removing', onRemove)}
            aria-label={`Remove ${title}`}
            title="Remove"
            className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-2 text-sm leading-none transition hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {busy === 'removing' ? '…' : '🗑️'}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} />
    </div>
  );
}
