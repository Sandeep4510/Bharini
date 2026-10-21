'use client';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, DisciplineMedia, MediaSlot } from '@bharini/types';

import { UploadCard } from '@/components/upload-card';

const ACCEPT = {
  video: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm',
  audio: 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac',
};

function formatLength(seconds: number) {
  return seconds < 60 ? `${seconds} sec` : `${seconds / 60} min`;
}

/** Reads the length in the browser for instant feedback; the server checks again. */
function readDuration(file: File, kind: MediaSlot['kind']): Promise<number | null> {
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
    if (!file.type.startsWith(`${slot.kind}/`) && !/\.(mp4|mov|webm|mp3|m4a|wav|ogg|flac)$/i.test(file.name)) {
      return `Choose a${slot.kind === 'audio' ? 'n audio' : ' video'} file.`;
    }
    if (file.size > slot.max_mb * 1024 * 1024) return `File is too large (max ${slot.max_mb} MB).`;
    const duration = await readDuration(file, slot.kind);
    if (duration !== null && duration > slot.max_seconds + 0.5) {
      return `This clip is ${duration.toFixed(1)} sec; the limit is ${formatLength(slot.max_seconds)}.`;
    }
    return null;
  };
}

export function MediaSlotGrid({ section, onProfile }: { section: DisciplineMedia; onProfile: (profile: ArtistProfile) => void }) {
  const kinds = (['video', 'audio'] as const).filter((kind) => section.slots.some((slot) => slot.kind === kind));

  return (
    <div className="space-y-6">
      {kinds.map((kind) => (
        <div key={kind}>
          {kinds.length > 1 ? <p className="mb-3 text-sm font-medium uppercase tracking-[0.16em] text-slate-400">{kind === 'video' ? 'Videos' : 'Audio'}</p> : null}
          <div className={`grid gap-3 ${kind === 'audio' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-3'}`}>
            {section.slots
              .filter((slot) => slot.kind === kind)
              .map((slot) => (
                <UploadCard
                  key={slot.key}
                  title={slot.label}
                  subtitle={`max ${formatLength(slot.max_seconds)}`}
                  accept={ACCEPT[kind]}
                  filled={Boolean(slot.file)}
                  preview={
                    kind === 'video' ? (
                      <video src={slot.file?.url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
                    ) : (
                      <audio src={slot.file?.url} controls preload="metadata" className="w-full" />
                    )
                  }
                  placeholder={
                    <div className={`flex w-full items-center justify-center rounded-xl bg-slate-900/60 text-3xl opacity-40 ${kind === 'video' ? 'aspect-video' : 'h-14'}`} aria-hidden>
                      {kind === 'video' ? '🎬' : '🎵'}
                    </div>
                  }
                  check={checkerFor(slot)}
                  onUpload={(file) => apiClient.uploadMedia(section.discipline, slot.key, file)}
                  onRemove={() => apiClient.deleteMedia(section.discipline, slot.key)}
                  onProfile={onProfile}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
