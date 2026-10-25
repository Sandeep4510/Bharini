/* eslint-disable @next/next/no-img-element -- profile photos are served by the API host */
'use client';

import { useRef, useState } from 'react';

import { errorMessage, fieldErrorsFrom } from '@/components/profile-fields';

const PHOTO_MAX_MB = 8;

/** Click the photo to replace it straight away; the server face-checks it like in onboarding. */
export function PhotoChangeButton({
  src,
  alt,
  fallback,
  upload,
  sizeClass = 'h-28 w-28',
}: {
  src: string | null;
  alt: string;
  fallback: string;
  upload: (file: File) => Promise<unknown>;
  sizeClass?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) return setError(`Photo is too large (max ${PHOTO_MAX_MB} MB).`);
    setBusy(true);
    setError('');
    try {
      await upload(file);
    } catch (caughtError) {
      const fields = fieldErrorsFrom(caughtError);
      setError(fields.profile_photo || fields.profile_picture || errorMessage(caughtError, 'Could not change photo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Change profile picture"
        aria-label="Change profile picture"
        className={`group relative block overflow-hidden rounded-full border-2 border-violet-500/60 bg-slate-950 ${sizeClass}`}
      >
        {src ? (
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-violet-500 text-3xl font-semibold text-white">{fallback}</span>
        )}
        <span
          className={`absolute inset-0 flex items-center justify-center bg-slate-950/60 text-xs font-semibold text-white transition ${
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
          }`}
        >
          {busy ? 'Uploading…' : '📷 Change'}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
      {error ? <p className="mt-2 max-w-48 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
