/* eslint-disable @next/next/no-img-element -- portfolio images are served by the API host */
'use client';

import { useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, DisciplineMedia, MediaSlot } from '@bharini/types';

import { errorMessage, fieldErrorsFrom } from '@/components/profile-fields';
import { UploadCard } from '@/components/upload-card';

const ACCEPT = {
  video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm',
  audio: 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac',
  image: 'image/jpeg,image/png,image/webp',
  writing: 'image/jpeg,image/png,image/webp',
};

const KIND_HEADINGS = { image: 'Images', video: 'Videos', audio: 'Audio', writing: 'Posts' };
const KIND_ICONS = { image: '📷', video: '🎬', audio: '🎵', writing: '📷' };

function formatLength(seconds: number) {
  return seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`;
}

/** Reads the length in the browser for instant feedback; the server checks again. */
function readDuration(file: File, kind: 'video' | 'audio'): Promise<number | null> {
  return new Promise((resolve) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.preload = 'metadata';
    element.onloadedmetadata = () => done(Number.isFinite(element.duration) ? element.duration : null);
    element.onerror = () => done(null);
    element.src = url;
  });
}

function checkerFor(slot: MediaSlot) {
  return async (file: File) => {
    if (slot.kind === 'image' || slot.kind === 'writing') {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return 'Choose a JPG, PNG or WebP image.';
      return file.size > slot.max_mb * 1024 * 1024 ? `Image is too large (max ${slot.max_mb} MB).` : null;
    }
    if (!file.type.startsWith(`${slot.kind}/`) && !/\.(mp4|mov|webm|mp3|m4a|wav|ogg|flac)$/i.test(file.name)) {
      return `Choose a${slot.kind === 'audio' ? 'n audio' : ' video'} file.`;
    }
    if (file.size > slot.max_mb * 1024 * 1024) return `File is too large (max ${slot.max_mb} MB).`;
    const duration = await readDuration(file, slot.kind as 'video' | 'audio');
    if (duration !== null && duration > slot.max_seconds + 0.5) {
      return `This clip is ${duration.toFixed(1)} sec; the limit is ${formatLength(slot.max_seconds)}.`;
    }
    return null;
  };
}

/** A writer's post: a picture or a text, picked with the switch. Saving one kind replaces the other on the server. */
function WritingSlot({ discipline, slot, onProfile }: { discipline: string; slot: MediaSlot; onProfile: (profile: ArtistProfile) => void }) {
  const savedText = slot.file?.kind === 'text' ? slot.file.text : '';
  const [mode, setMode] = useState<'image' | 'text'>(slot.file?.kind === 'text' ? 'text' : 'image');
  const [text, setText] = useState(savedText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const maxChars = slot.max_chars ?? 2000;

  const run = async (action: () => Promise<{ data?: ArtistProfile }>) => {
    setBusy(true);
    setError('');
    try {
      const response = await action();
      if (response.data) onProfile(response.data);
    } catch (caughtError) {
      setError(fieldErrorsFrom(caughtError).text || errorMessage(caughtError, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (
    <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-950/60 p-1 text-xs font-semibold" role="radiogroup" aria-label={`${slot.label} type`}>
      {(['image', 'text'] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className={`rounded-md px-2 py-1.5 transition ${mode === value ? 'bg-violet-500/90 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          {value === 'image' ? '📷 Picture' : '✍️ Text'}
        </button>
      ))}
    </div>
  );

  if (mode === 'image') {
    return (
      <div className="min-w-0">
        {toggle}
        <UploadCard
          title={slot.label}
          subtitle={`max ${slot.max_mb} MB`}
          accept={ACCEPT.image}
          filled={slot.file?.kind === 'image'}
          preview={<img src={slot.file?.url ?? undefined} alt={slot.label} className="aspect-video w-full rounded-xl bg-black object-cover" />}
          placeholder={
            <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-slate-900/60 text-3xl opacity-40" aria-hidden>
              📷
            </div>
          }
          check={checkerFor(slot)}
          onUpload={(file) => apiClient.uploadMedia(discipline, slot.key, file)}
          onRemove={() => apiClient.deleteMedia(discipline, slot.key)}
          onProfile={onProfile}
        />
      </div>
    );
  }

  const filled = slot.file?.kind === 'text';
  return (
    <div className="min-w-0">
      {toggle}
      <div className={`flex flex-col rounded-2xl border p-3 ${filled ? 'border-violet-500/40 bg-slate-900/70' : 'border-dashed border-slate-700 bg-slate-950/40'}`}>
        <div className="mb-2 flex items-baseline justify-between gap-x-2">
          <p className="min-w-0 truncate font-medium text-white">{slot.label}</p>
          <p className="text-xs text-slate-400">
            {text.length}/{maxChars}
          </p>
        </div>
        <textarea
          value={text}
          maxLength={maxChars}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          aria-label={`${slot.label} text`}
          placeholder="A scene, a poem, an excerpt…"
          className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/60 p-2 text-sm text-white outline-none focus:border-violet-400"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy || !text.trim() || text === savedText}
            onClick={() => void run(() => apiClient.saveMediaText(discipline, slot.key, text))}
            className="min-w-0 flex-1 truncate rounded-lg bg-violet-500/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {filled ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const response = await apiClient.deleteMedia(discipline, slot.key);
                  setText('');
                  return response;
                })
              }
              aria-label={`Remove ${slot.label}`}
              title="Remove"
              className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-2 text-sm leading-none transition hover:border-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              🗑️
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}

export function MediaSlotGrid({ section, onProfile }: { section: DisciplineMedia; onProfile: (profile: ArtistProfile) => void }) {
  const kinds = (['writing', 'image', 'video', 'audio'] as const).filter((kind) => section.slots.some((slot) => slot.kind === kind));

  return (
    <div className="space-y-6">
      {kinds.map((kind) => (
        <div key={kind}>
          {kinds.length > 1 ? <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-slate-400">{KIND_HEADINGS[kind]}</p> : null}
          <div className={`grid gap-3 ${kind === 'audio' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-3'}`}>
            {section.slots
              .filter((slot) => slot.kind === kind)
              .map((slot) =>
                slot.kind === 'writing' ? (
                  <WritingSlot key={slot.key} discipline={section.discipline} slot={slot} onProfile={onProfile} />
                ) : (
                <UploadCard
                  key={slot.key}
                  title={slot.label}
                  subtitle={kind === 'image' ? `max ${slot.max_mb} MB` : `max ${formatLength(slot.max_seconds)}`}
                  accept={ACCEPT[kind]}
                  filled={Boolean(slot.file)}
                  preview={
                    kind === 'image' ? (
                      <img src={slot.file?.url ?? undefined} alt={slot.label} className="aspect-video w-full rounded-xl bg-black object-cover" />
                    ) : kind === 'video' ? (
                      <video src={slot.file?.url ?? undefined} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
                    ) : (
                      <audio src={slot.file?.url ?? undefined} controls preload="metadata" className="w-full" />
                    )
                  }
                  placeholder={
                    <div className={`flex w-full items-center justify-center rounded-xl bg-slate-900/60 text-3xl opacity-40 ${kind === 'audio' ? 'h-14' : 'aspect-video'}`} aria-hidden>
                      {KIND_ICONS[kind]}
                    </div>
                  }
                  check={checkerFor(slot)}
                  onUpload={(file) => apiClient.uploadMedia(section.discipline, slot.key, file)}
                  onRemove={() => apiClient.deleteMedia(section.discipline, slot.key)}
                  onProfile={onProfile}
                />
                ),
              )}
          </div>
        </div>
      ))}
    </div>
  );
}
