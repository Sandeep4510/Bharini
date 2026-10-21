'use client';

import { useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile } from '@bharini/types';

import { MediaSlotGrid } from '@/components/media-slot-grid';
import { PhotoSlots } from '@/components/photo-slots';
import { errorMessage, fieldErrorsFrom, inputClass, okBorder, secondaryButton } from '@/components/profile-fields';

const SHOWREEL_LIMIT = 5;

function ShowreelLinks({ profile, onProfile }: { profile: ArtistProfile; onProfile: (profile: ArtistProfile) => void }) {
  const [links, setLinks] = useState<string[]>(profile.showreel_links.length ? profile.showreel_links : ['']);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setStatus('Saving…');
    setError('');
    try {
      const response = await apiClient.updateProfile({ showreel_links: links.map((link) => link.trim()).filter(Boolean) });
      if (response.data) onProfile(response.data);
      setStatus('Saved');
    } catch (caughtError) {
      setStatus('');
      setError(fieldErrorsFrom(caughtError).showreel_links || errorMessage(caughtError, 'Could not save links.'));
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="font-medium text-white">Showreel links</p>
      <p className="mt-1 text-sm text-slate-400">Your films and reels on YouTube, Vimeo or Google Drive (up to {SHOWREEL_LIMIT}).</p>
      <div className="mt-3 space-y-2">
        {links.map((link, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="url"
              value={link}
              placeholder="https://youtube.com/watch?v=…"
              onChange={(event) => setLinks(links.map((item, i) => (i === index ? event.target.value : item)))}
              className={`${inputClass} ${okBorder}`}
            />
            <button type="button" onClick={() => setLinks(links.filter((_, i) => i !== index))} className={secondaryButton} aria-label="Remove link">
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {links.length < SHOWREEL_LIMIT ? (
          <button type="button" onClick={() => setLinks([...links, ''])} className={secondaryButton}>
            + Add link
          </button>
        ) : null}
        <button type="button" onClick={() => void save()} className={secondaryButton}>
          Save links
        </button>
        {status ? <span className="text-sm text-slate-400">{status}</span> : null}
      </div>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

/** Casting photos plus one tab of media slots per discipline the artist picked. */
export function PortfolioEditor({ profile, onProfile }: { profile: ArtistProfile; onProfile: (profile: ArtistProfile) => void }) {
  const [activeTab, setActiveTab] = useState(profile.media_slots[0]?.discipline);
  const section = profile.media_slots.find((item) => item.discipline === activeTab) ?? profile.media_slots[0];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold text-white">Casting photos</h2>
        <p className="mt-1 mb-4 text-sm text-slate-400">Casting teams compare these four shots first. Natural light, no filters.</p>
        <PhotoSlots profile={profile} onProfile={onProfile} />
      </section>

      {section ? (
        <section>
          <h2 className="text-xl font-semibold text-white">Showcase</h2>
          <p className="mt-1 mb-4 text-sm text-slate-400">
            {section.discipline === 'actor'
              ? 'Nine 10-second clips, one for each emotion (navarasa). Face the camera; no music or edits.'
              : 'Show your best work. Short, clear clips work better than long ones.'}
          </p>

          {profile.media_slots.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2" role="tablist">
              {profile.media_slots.map((item) => {
                const filled = item.slots.filter((slot) => slot.file).length;
                const selected = item.discipline === section.discipline;
                return (
                  <button
                    key={item.discipline}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(item.discipline)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      selected ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {item.label} <span className="text-slate-400">{filled}/{item.slots.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <MediaSlotGrid key={section.discipline} section={section} onProfile={onProfile} />
          {section.discipline === 'director' ? <ShowreelLinks profile={profile} onProfile={onProfile} /> : null}
        </section>
      ) : null}
    </div>
  );
}
