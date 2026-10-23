'use client';

import { useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';

import {
  ErrorBanner,
  Field,
  errorMessage,
  inputClass,
  okBorder,
  primaryButton,
  secondaryButton,
} from '@/components/profile-fields';

const initialCasting = {
  age_min: '18',
  age_max: '30',
  gender: 'any',
  complexion: 'any',
  languages: '',
  location: '',
  approx_pay: '',
};

export function PostComposer({ onPosted }: { onPosted: () => void }) {
  const [body, setBody] = useState('');
  const [casting, setCasting] = useState(initialCasting);
  const [image, setImage] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateCasting = (field: keyof typeof initialCasting, value: string) =>
    setCasting((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.createPost(
        {
          post_type: 'casting_call',
          body,
          casting: {
            ...casting,
            age_min: Number(casting.age_min),
            age_max: Number(casting.age_max),
            gender: casting.gender as 'any' | 'male' | 'female' | 'other',
            complexion: casting.complexion as 'any' | 'fair' | 'wheatish' | 'medium' | 'dusky' | 'dark',
          },
        },
        image,
      );
      setBody('');
      setCasting(initialCasting);
      setImage(null);
      setInputKey((key) => key + 1);
      onPosted();
    } catch (err) {
      setError(errorMessage(err, 'Could not publish post.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-5 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6"
      noValidate
    >
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-violet-300">New casting call</p>
        <p className="mt-1 text-sm text-slate-400">Describe the role and who you are looking for.</p>
      </div>

      <ErrorBanner message={error ?? ''} />

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        required
        rows={3}
        placeholder="Describe the role and add #hashtags"
        className={`${inputClass} ${okBorder} resize-y`}
      />

      <label className={`${secondaryButton} inline-block cursor-pointer`}>
        {image ? `🖼️ ${image.name}` : '🖼️ Add casting image'}
        <input
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Min age">
          <input
            type="number"
            min={0}
            max={120}
            value={casting.age_min}
            onChange={(e) => updateCasting('age_min', e.target.value)}
            required
            className={`${inputClass} ${okBorder}`}
          />
        </Field>
        <Field label="Max age">
          <input
            type="number"
            min={0}
            max={120}
            value={casting.age_max}
            onChange={(e) => updateCasting('age_max', e.target.value)}
            required
            className={`${inputClass} ${okBorder}`}
          />
        </Field>
        <Field label="Gender">
          <select
            value={casting.gender}
            onChange={(e) => updateCasting('gender', e.target.value)}
            className={`${inputClass} ${okBorder}`}
          >
            <option value="any">Any</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Complexion">
          <select
            value={casting.complexion}
            onChange={(e) => updateCasting('complexion', e.target.value)}
            className={`${inputClass} ${okBorder}`}
          >
            <option value="any">Any</option>
            <option value="fair">Fair</option>
            <option value="wheatish">Wheatish</option>
            <option value="medium">Medium</option>
            <option value="dusky">Dusky</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
        <Field label="Languages">
          <input
            value={casting.languages}
            onChange={(e) => updateCasting('languages', e.target.value)}
            required
            maxLength={200}
            placeholder="Hindi, Tamil"
            className={`${inputClass} ${okBorder}`}
          />
        </Field>
        <Field label="Location">
          <input
            value={casting.location}
            onChange={(e) => updateCasting('location', e.target.value)}
            required
            maxLength={200}
            placeholder="Chennai"
            className={`${inputClass} ${okBorder}`}
          />
        </Field>
        <div className="sm:col-span-3">
          <Field label="Approx pay">
            <input
              value={casting.approx_pay}
              onChange={(e) => updateCasting('approx_pay', e.target.value)}
              required
              maxLength={200}
              placeholder="₹50,000 per day"
              className={`${inputClass} ${okBorder}`}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isSubmitting} className={primaryButton}>
          {isSubmitting ? 'Publishing…' : 'Publish casting call'}
        </button>
      </div>
    </form>
  );
}
