/* eslint-disable @next/next/no-img-element -- previews are local object URLs or API-hosted uploads */
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, Discipline, LanguageLevel, ProfileLanguage, ProfileOptions } from '@bharini/types';

import { useAuth } from '@/components/auth-provider';
import { AuthInput } from '@/components/auth-shell';
import { CompletionBar } from '@/components/completion-bar';
import { DisciplinePicker } from '@/components/discipline-picker';
import { DateOfBirthInput } from '@/components/dob-input';
import { HeightInput } from '@/components/height-input';
import { AppHeader } from '@/components/app-header';
import { PortfolioEditor } from '@/components/portfolio-editor';
import {
  ErrorBanner,
  Field,
  SelectField,
  TextAreaField,
  errorBorder,
  errorMessage,
  fieldErrorsFrom,
  inputClass,
  okBorder,
  onLeave,
  primaryButton,
  secondaryButton,
} from '@/components/profile-fields';
import { USERNAME_PATTERN, UsernameInput } from '@/components/username-input';
import { useArtistProfile } from '@/components/use-artist-profile';
import { INDIAN_CITIES } from '@/lib/indian-cities';

const STEPS = ['About you', 'Languages', 'Contact', 'Portfolio'];
const STEP_FIELDS = [
  ['username', 'disciplines', 'profile_photo', 'bio', 'gender', 'date_of_birth', 'height_cm'],
  ['languages'],
  ['location', 'phone'],
];

function firstIncompleteStep(profile: ArtistProfile) {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((field) => profile.missing_fields.includes(field)));
  return index === -1 ? STEPS.length - 1 : index;
}

type StepProps = {
  profile: ArtistProfile;
  options: ProfileOptions;
  onProfile: (profile: ArtistProfile) => void;
  onNext: () => void;
};

function StepActions({ busy, label = 'Save & continue', onBack }: { busy: boolean; label?: string; onBack?: () => void }) {
  return (
    <div className="flex justify-between gap-3 pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
      ) : (
        <span />
      )}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  );
}

function AboutStep({ profile, options, onProfile, onNext }: StepProps) {
  const [username, setUsername] = useState(profile.username ?? '');
  const [disciplines, setDisciplines] = useState<Discipline[]>(profile.disciplines);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState(profile.profile_photo ?? '');
  const [bio, setBio] = useState(profile.bio);
  const [gender, setGender] = useState<string>(profile.gender);
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? '');
  const [heightCm, setHeightCm] = useState(profile.height_cm);
  const isActor = disciplines.includes('actor');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setErrors((previous) => ({ ...previous, profile_photo: '' }));
  };

  const validate = () => {
    const clientErrors: Record<string, string> = {};
    if (!username) clientErrors.username = 'Choose a username.';
    else if (!USERNAME_PATTERN.test(username)) clientErrors.username = 'Use 3-30 lowercase letters, numbers, dots or underscores.';
    if (!disciplines.length) clientErrors.disciplines = 'Pick at least one.';
    if (!photo && !profile.profile_photo) clientErrors.profile_photo = 'Add a clear photo of yourself.';
    if (!bio.trim()) clientErrors.bio = 'Tell casting teams a little about yourself.';
    if (!gender) clientErrors.gender = 'Choose one.';
    if (!dateOfBirth) clientErrors.date_of_birth = 'Enter your date of birth.';
    if (isActor && !heightCm) clientErrors.height_cm = 'Enter your height.';
    return clientErrors;
  };
  const check = (field: string) => setErrors((previous) => ({ ...previous, [field]: validate()[field] ?? '' }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setError('');
    if (Object.keys(clientErrors).length) return;

    const body = new FormData();
    body.append('username', username);
    disciplines.forEach((discipline) => body.append('disciplines', discipline));
    if (photo) body.append('profile_photo', photo);
    body.append('bio', bio.trim());
    body.append('gender', gender);
    body.append('date_of_birth', dateOfBirth);
    if (isActor && heightCm) body.append('height_cm', String(heightCm));

    setBusy(true);
    try {
      const response = await apiClient.updateProfile(body);
      if (response.data) onProfile(response.data);
      onNext();
    } catch (caughtError) {
      setErrors(fieldErrorsFrom(caughtError));
      setError(errorMessage(caughtError, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <ErrorBanner message={error} />
      <UsernameInput
        value={username}
        savedValue={profile.username ?? ''}
        onChange={setUsername}
        error={errors.username}
        onError={(message) => setErrors((previous) => ({ ...previous, username: message }))}
      />
      <div onBlur={onLeave(() => check('disciplines'))}>
        <DisciplinePicker options={options.disciplines} value={disciplines} onChange={setDisciplines} error={errors.disciplines} />
      </div>

      <Field label="Profile photo" error={errors.profile_photo} hint="A real, recent photo of you: a headshot or a full-body shot. We check that your face is visible.">
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-950/70 text-3xl text-slate-600">
            {photoPreview ? <img src={photoPreview} alt="Profile preview" className="h-full w-full object-cover" /> : '👤'}
          </div>
          <label className={`${secondaryButton} cursor-pointer`}>
            {photoPreview ? 'Change photo' : 'Choose photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => choosePhoto(event.target.files?.[0])} />
          </label>
        </div>
      </Field>

      <div onBlur={onLeave(() => check('bio'))}>
        <TextAreaField label="About yourself" value={bio} onChange={setBio} maxLength={1000} placeholder="Training, experience, theatre, notable work…" error={errors.bio} />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div onBlur={onLeave(() => check('gender'))}>
          <SelectField label="Sex" value={gender} onChange={setGender} options={options.genders} placeholder="Select" error={errors.gender} />
        </div>
        <div onBlur={onLeave(() => check('date_of_birth'))}>
          <DateOfBirthInput value={dateOfBirth} onChange={setDateOfBirth} error={errors.date_of_birth} />
        </div>
      </div>
      {isActor ? (
        <div onBlur={onLeave(() => check('height_cm'))}>
          <HeightInput value={heightCm} onChange={setHeightCm} error={errors.height_cm} />
        </div>
      ) : null}

      <StepActions busy={busy} />
    </form>
  );
}

function LanguagesStep({ profile, options, onProfile, onNext, onBack }: StepProps & { onBack: () => void }) {
  const [rows, setRows] = useState<{ language: string; level: string }[]>(
    profile.languages.length ? profile.languages : [{ language: '', level: '' }],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (index: number, change: Partial<{ language: string; level: string }>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (rows.some((row) => !row.language || !row.level)) return setError('Pick a language and level in every row.');
    if (new Set(rows.map((row) => row.language)).size !== rows.length) return setError('Each language can be added only once.');

    setBusy(true);
    try {
      const response = await apiClient.setLanguages(rows as ProfileLanguage[]);
      if (response.data) onProfile(response.data);
      onNext();
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not save languages.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <ErrorBanner message={error} />
      <p className="text-sm text-slate-300">Add every language you can perform in, and how well you speak it.</p>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <SelectField label={index === 0 ? 'Language' : ''} value={row.language} onChange={(language) => update(index, { language })} options={options.languages} placeholder="Language" />
          <SelectField
            label={index === 0 ? 'Level' : ''}
            value={row.level}
            onChange={(level) => update(index, { level: level as LanguageLevel })}
            options={options.language_levels}
            placeholder="Level"
          />
          <button
            type="button"
            disabled={rows.length === 1}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            className={`${secondaryButton} h-[50px]`}
            aria-label="Remove language"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { language: '', level: '' }])} className={secondaryButton}>
        + Add language
      </button>
      <StepActions busy={busy} onBack={onBack} />
    </form>
  );
}

function normalizeSocial(value: string, host: string) {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(host)) return `https://${trimmed}`;
  return `https://${host}/${trimmed.replace(/^@/, '')}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function ContactStep({ profile, onProfile, onNext, onBack }: StepProps & { onBack: () => void }) {
  const [location, setLocation] = useState(profile.location);
  const [phone, setPhone] = useState(profile.phone.replace(/^\+91/, ''));
  const [altEmail, setAltEmail] = useState(profile.alt_email);
  const [pin, setPin] = useState('');
  const [pinSentTo, setPinSentTo] = useState('');
  const [instagram, setInstagram] = useState(profile.instagram_url);
  const [facebook, setFacebook] = useState(profile.facebook_url);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'pin' | 'verify' | 'save'>('');

  const verified = profile.alt_email_verified && altEmail.trim().toLowerCase() === profile.alt_email.toLowerCase();

  const attempt = async (kind: 'pin' | 'verify' | 'save', action: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setErrors({});
    try {
      await action();
    } catch (caughtError) {
      setErrors(fieldErrorsFrom(caughtError));
      setError(errorMessage(caughtError, 'Something went wrong.'));
    } finally {
      setBusy('');
    }
  };

  const sendPin = () =>
    attempt('pin', async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(altEmail.trim())) {
        throw new Error('Enter a valid additional email first.');
      }
      if (altEmail.trim().toLowerCase() !== profile.alt_email.toLowerCase()) {
        const saved = await apiClient.updateProfile({ alt_email: altEmail.trim() });
        if (saved.data) onProfile(saved.data);
      }
      await apiClient.sendAltEmailPin();
      setPin('');
      setPinSentTo(altEmail.trim());
    });

  const verifyPin = () =>
    attempt('verify', async () => {
      const response = await apiClient.verifyAltEmailPin(pin);
      if (response.data) onProfile(response.data);
      setPinSentTo('');
    });

  const validate = () => {
    const clientErrors: Record<string, string> = {};
    if (!location.trim()) clientErrors.location = 'Enter your city.';
    if (!phone) clientErrors.phone = 'Enter your mobile number.';
    else if (!/^[6-9]\d{9}$/.test(phone)) clientErrors.phone = 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
    if (altEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(altEmail.trim())) clientErrors.alt_email = 'Enter a valid email, like you.work@example.com.';
    if (instagram.trim() && !/(^|\.)instagram\.com$/i.test(hostOf(normalizeSocial(instagram, 'instagram.com')))) {
      clientErrors.instagram_url = 'Enter your Instagram profile, like instagram.com/yourname or @yourname.';
    }
    if (facebook.trim() && !/(^|\.)(facebook|fb)\.com$/i.test(hostOf(normalizeSocial(facebook, 'facebook.com')))) {
      clientErrors.facebook_url = 'Enter your Facebook profile, like facebook.com/yourname.';
    }
    return clientErrors;
  };
  const check = (field: string) => setErrors((previous) => ({ ...previous, [field]: validate()[field] ?? '' }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;

    void attempt('save', async () => {
      const response = await apiClient.updateProfile({
        location: location.trim(),
        phone: `+91${phone}`,
        alt_email: altEmail.trim(),
        instagram_url: normalizeSocial(instagram, 'instagram.com'),
        facebook_url: normalizeSocial(facebook, 'facebook.com'),
      });
      if (response.data) onProfile(response.data);
      onNext();
    });
  };

  return (
    <form className="space-y-5" onSubmit={submit} noValidate>
      <ErrorBanner message={error} />
      <Field label="Location" error={errors.location} hint="Helps production teams find local talent for shoots near you.">
        <input
          value={location}
          maxLength={100}
          list="indian-cities"
          autoComplete="off"
          placeholder="Start typing your city (e.g. Mangaluru)"
          onChange={(event) => setLocation(event.target.value)}
          onBlur={() => check('location')}
          aria-invalid={errors.location ? true : undefined}
          className={`${inputClass} ${errors.location ? errorBorder : okBorder}`}
        />
        <datalist id="indian-cities">
          {INDIAN_CITIES.map((city) => (
            <option key={city} value={city} />
          ))}
        </datalist>
      </Field>
      <Field label="Mobile number" error={errors.phone} hint="Indian mobile numbers only.">
        <div className="flex">
          <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-700 bg-slate-900 px-3 text-slate-300">+91</span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="98765 43210"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
            onBlur={() => check('phone')}
            aria-invalid={errors.phone ? true : undefined}
            className={`${inputClass} ${errors.phone ? errorBorder : okBorder} rounded-l-none`}
          />
        </div>
      </Field>

      <Field label="Additional email (optional)" error={errors.alt_email} hint="A backup email casting teams can reach you on. Must be different from your login email. Verify it with a PIN.">
        <div className="flex gap-2" onBlur={onLeave(() => check('alt_email'))}>
          <input
            type="email"
            value={altEmail}
            placeholder="you.work@example.com"
            onChange={(event) => setAltEmail(event.target.value)}
            className={`w-full rounded-xl border bg-slate-950/70 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:ring-2 ${
              errors.alt_email ? 'border-red-500 focus:ring-red-500/20' : 'border-slate-700 focus:border-violet-400 focus:ring-violet-500/20'
            }`}
          />
          {verified ? (
            <span className="inline-flex shrink-0 items-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-300">✓ Verified</span>
          ) : (
            <button type="button" disabled={busy === 'pin'} onClick={() => void sendPin()} className={`${secondaryButton} shrink-0`}>
              {busy === 'pin' ? 'Sending…' : pinSentTo ? 'Resend PIN' : 'Send PIN'}
            </button>
          )}
        </div>
      </Field>

      {pinSentTo && !verified ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
          <p className="text-sm font-medium text-emerald-300">✓ PIN sent to {pinSentTo}</p>
          <p className="mt-1 text-sm text-slate-300">You might receive it in a minute or so. Check your spam folder too. The PIN expires in 10 minutes.</p>
          <div className="mt-3 flex gap-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-40 rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-3 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-violet-400"
            />
            <button type="button" disabled={pin.length !== 6 || busy === 'verify'} onClick={() => void verifyPin()} className={primaryButton}>
              {busy === 'verify' ? 'Checking…' : 'Verify'}
            </button>
          </div>
          {errors.pin ? <p className="mt-2 text-sm text-red-300">{errors.pin}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div onBlur={onLeave(() => check('instagram_url'))}>
          <AuthInput label="Instagram (optional)" placeholder="instagram.com/yourname or @yourname" value={instagram} onChange={setInstagram} error={errors.instagram_url} />
        </div>
        <div onBlur={onLeave(() => check('facebook_url'))}>
          <AuthInput label="Facebook (optional)" placeholder="facebook.com/yourname" value={facebook} onChange={setFacebook} error={errors.facebook_url} />
        </div>
      </div>

      <StepActions busy={busy === 'save'} onBack={onBack} />
    </form>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { hydrate } = useAuth();
  const { profile, setProfile, options, notArtist, error } = useArtistProfile();
  const [chosenStep, setChosenStep] = useState<number | null>(null);

  useEffect(() => {
    if (notArtist) router.replace('/home');
  }, [notArtist, router]);

  if (!profile || !options) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        {error ? <ErrorBanner message={error} /> : 'Loading your profile…'}
      </main>
    );
  }

  const unlockedUpTo = firstIncompleteStep(profile);
  const step = chosenStep ?? unlockedUpTo;
  const goTo = (next: number) => {
    setChosenStep(next);
    window.scrollTo({ top: 0 });
  };
  const stepProps = { profile, options, onProfile: setProfile };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <AppHeader />
        </div>

        <p className="text-sm uppercase tracking-[0.16em] text-violet-300">Set up your profile</p>
        <h1 className="mt-2 text-3xl font-semibold">{STEPS[step]}</h1>

        <ol className="mt-6 grid grid-cols-4 gap-2">
          {STEPS.map((label, index) => {
            const reachable = index <= unlockedUpTo || profile.onboarding_complete;
            return (
              <li key={label}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => goTo(index)}
                  className="w-full text-left disabled:cursor-not-allowed"
                >
                  <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-violet-500' : 'bg-slate-800'}`} />
                  <span className={`mt-2 block text-xs ${index === step ? 'text-white' : 'text-slate-400'}`}>
                    {index + 1}. {label}
                    {index === 3 ? ' (optional)' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
          {step === 0 ? <AboutStep {...stepProps} onNext={() => goTo(1)} /> : null}
          {step === 1 ? <LanguagesStep {...stepProps} onNext={() => goTo(2)} onBack={() => goTo(0)} /> : null}
          {step === 2 ? <ContactStep {...stepProps} onNext={() => goTo(3)} onBack={() => goTo(1)} /> : null}
          {step === 3 ? (
            <div className="space-y-8">
              <CompletionBar percent={profile.completion_percent} />
              <PortfolioEditor profile={profile} onProfile={setProfile} />
              <div className="flex justify-between gap-3">
                <button type="button" onClick={() => goTo(2)} className={secondaryButton}>
                  Back
                </button>
                <button type="button" disabled={!profile.onboarding_complete} onClick={() => void hydrate().then(() => router.push('/home'))} className={primaryButton}>
                  {profile.completion_percent < 100 ? 'Skip for now' : 'Finish'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
