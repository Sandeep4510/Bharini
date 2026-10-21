'use client';

import { useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile } from '@bharini/types';

import { ErrorBanner, errorMessage, fieldErrorsFrom, inputClass, okBorder, secondaryButton } from '@/components/profile-fields';

const KINDS = [
  { value: 'certificate', label: 'Certificate' },
  { value: 'achievement', label: 'Achievement' },
];
const MAX_MB = 10;

/** Certificates and achievements: PDF or image, with a short title. */
export function DocumentsSection({ profile, onProfile }: { profile: ArtistProfile; onProfile: (profile: ArtistProfile) => void }) {
  const [kind, setKind] = useState('certificate');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return setError('Give the document a title.');
    if (!file) return setError('Choose a PDF or image.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`File is too large (max ${MAX_MB} MB).`);
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.addDocument(kind, title.trim(), file);
      if (response.data) onProfile(response.data);
      setTitle('');
      setFile(null);
      setInputKey((key) => key + 1);
    } catch (caughtError) {
      setError(Object.values(fieldErrorsFrom(caughtError))[0] || errorMessage(caughtError, 'Could not add document.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      const response = await apiClient.deleteDocument(id);
      if (response.data) onProfile(response.data);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not remove document.'));
    }
  };

  return (
    <section>
      <h2 className="text-xl font-semibold text-white">Certificates & achievements</h2>
      <p className="mt-1 mb-4 text-sm text-slate-400">Training certificates, awards, press mentions. PDF, JPG, PNG or WebP up to {MAX_MB} MB.</p>

      {profile.documents.length ? (
        <ul className="mb-4 space-y-2">
          {profile.documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <a href={document.file} target="_blank" rel="noreferrer" className="min-w-0 truncate text-slate-100 hover:text-violet-200">
                {document.kind === 'achievement' ? '🏆' : '📜'} {document.title}
              </a>
              <button type="button" onClick={() => void remove(document.id)} className={secondaryButton} aria-label={`Remove ${document.title}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={add} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4" noValidate>
        <ErrorBanner message={error} />
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <select aria-label="Type" value={kind} onChange={(event) => setKind(event.target.value)} className={`${inputClass} ${okBorder}`}>
            {KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input aria-label="Title" value={title} maxLength={120} placeholder="e.g. Bharatanatyam diploma, Best Actor 2024" onChange={(event) => setTitle(event.target.value)} className={`${inputClass} ${okBorder}`} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            key={inputKey}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-100"
          />
          <button type="submit" disabled={busy} className={secondaryButton}>
            {busy ? 'Uploading…' : '+ Add document'}
          </button>
        </div>
      </form>
    </section>
  );
}
