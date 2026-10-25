/* eslint-disable @next/next/no-img-element -- user uploads come from the API host, not a static import */
'use client';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, PhotoSlot } from '@bharini/types';

import { PoseGuide } from '@/components/pose-guides';
import { UploadCard } from '@/components/upload-card';

const PHOTO_MAX_MB = 8;

const SLOTS: { slot: PhotoSlot; title: string; guide: string }[] = [
  { slot: 'center', title: 'Front', guide: 'Face the camera, neutral expression, plain background' },
  { slot: 'left', title: 'Left profile', guide: 'Turn your head fully to show your left side' },
  { slot: 'right', title: 'Right profile', guide: 'Turn your head fully to show your right side' },
  { slot: 'full_length', title: 'Full length', guide: 'Head to toe, standing straight, fitted clothes' },
];

async function checkPhoto(file: File) {
  if (!file.type.startsWith('image/')) return 'Choose a photo (JPG, PNG or WebP).';
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) return `Photo is too large (max ${PHOTO_MAX_MB} MB).`;
  return null;
}

export function PhotoSlots({ profile, onProfile }: { profile: ArtistProfile; onProfile: (profile: ArtistProfile) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SLOTS.map(({ slot, title, guide }) => {
        const url = profile.photos[slot];
        return (
          <UploadCard
            key={slot}
            title={title}
            subtitle="Photo"
            accept="image/jpeg,image/png,image/webp"
            filled={Boolean(url)}
            preview={<img src={url ?? ''} alt={`${title} photo`} className="aspect-[3/4] w-full rounded-xl object-cover" />}
            placeholder={
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl bg-slate-900/60 p-3 text-center">
                <div className="min-h-0 w-full flex-1">
                  <PoseGuide slot={slot} />
                </div>
                <span className="text-xs text-slate-400">{guide}</span>
              </div>
            }
            check={checkPhoto}
            onUpload={(file) => apiClient.uploadPhoto(slot, file)}
            onRemove={() => apiClient.deletePhoto(slot)}
            onProfile={onProfile}
          />
        );
      })}
    </div>
  );
}
