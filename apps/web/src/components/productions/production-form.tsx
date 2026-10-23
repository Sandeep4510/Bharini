'use client';

import { useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { Production, ProductionKind } from '@bharini/types';

import { ErrorBanner, Field, inputClass, okBorder, primaryButton, secondaryButton } from '@/components/profile-fields';

export function ProductionForm({ onSaved }: { onSaved: (production: Production) => void }) {
  const [kind, setKind] = useState<ProductionKind>('house');
  const [name, setName] = useState('');
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('kind', kind);
      payload.append('name', name);
      if (picture) payload.append('profile_picture', picture);
      const res = await apiClient.createProduction(payload);
      if (res.data) onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-900/70 shadow-2xl shadow-violet-950/20 lg:grid lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="hidden border-r border-slate-800 bg-gradient-to-br from-violet-600/25 via-slate-900 to-slate-950 p-8 lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="mb-4 inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-violet-200">
            Production profile
          </p>
          <h2 className="max-w-sm text-4xl font-semibold leading-tight text-white">Build the home for your production brand.</h2>
        </div>

        <div className="space-y-4 text-sm text-slate-300">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
            <p className="font-medium text-white">Showcase your work</p>
            <p className="mt-2">Add your studio name, profile photo, and titles to tell the industry who you are.</p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
            <p className="font-medium text-white">Post casting calls</p>
            <p className="mt-2">Use the feed to share updates, releases, and role requirements with candidates.</p>
          </div>
        </div>
      </aside>

      <form onSubmit={(event) => void submit(event)} className="space-y-5 p-5 sm:p-7 lg:p-8" noValidate>
        <ErrorBanner message={error ?? ''} />
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-violet-300">Create profile</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Production details</h2>
          <p className="mt-2 text-sm text-slate-300">Tell artists who you are and what you make.</p>
        </div>

        <Field label="Profile type">
          <select value={kind} onChange={(event) => setKind(event.target.value as ProductionKind)} className={`${inputClass} ${okBorder}`}>
            <option value="house">Production house</option>
            <option value="individual">Individual producer</option>
          </select>
        </Field>

        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={150}
            placeholder="Bharini Pictures"
            className={`${inputClass} ${okBorder}`}
          />
        </Field>

        <Field label="Profile picture" hint="Optional, but recommended for a polished production home page.">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-950/70 text-3xl text-slate-600">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview; no optimized image loader is needed here.
                <img src={preview} alt="Production preview" className="h-full w-full object-cover" />
              ) : (
                '🏢'
              )}
            </div>
            <label className={`${secondaryButton} cursor-pointer`}>
              {preview ? 'Change photo' : 'Choose photo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPicture(file);
                  setPreview(URL.createObjectURL(file));
                }}
              />
            </label>
          </div>
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className={secondaryButton} onClick={() => window.history.back()}>
            Back
          </button>
          <button type="submit" disabled={isSubmitting} className={primaryButton}>
            {isSubmitting ? 'Saving…' : 'Create profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
