/* eslint-disable @next/next/no-img-element -- portfolio files are served by the API host */
import type { PublicProfile } from '@bharini/types';

const PHOTO_LABELS = { center: 'Front', left: 'Left profile', right: 'Right profile', full_length: 'Full length' };
const sectionClass = 'space-y-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-5';
const headingClass = 'text-sm font-medium uppercase tracking-[0.16em] text-slate-400';

/** Read-only view of an artist's work; only filled slots are shown. */
export function PublicPortfolio({ portfolio }: { portfolio: NonNullable<PublicProfile['portfolio']> }) {
  const photos = Object.entries(portfolio.photos ?? {}).filter((entry): entry is [keyof typeof PHOTO_LABELS, string] => Boolean(entry[1]));
  const sections = portfolio.media_slots
    .map((section) => ({ ...section, slots: section.slots.filter((slot) => slot.file) }))
    .filter((section) => section.slots.length);
  const empty = !photos.length && !sections.length && !portfolio.documents.length && !portfolio.showreel_links.length;

  return (
    <div className="space-y-4">
      {portfolio.languages.length ? (
        <div className="flex flex-wrap gap-2">
          {portfolio.languages.map((item) => (
            <span key={item.language} className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
              {item.language} <span className="text-slate-400">· {item.level}</span>
            </span>
          ))}
        </div>
      ) : null}

      {photos.length ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Casting photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photos.map(([slot, url]) => (
              <figure key={slot}>
                <img src={url} alt={PHOTO_LABELS[slot]} className="aspect-[3/4] w-full rounded-xl object-cover" />
                <figcaption className="mt-1 text-xs text-slate-400">{PHOTO_LABELS[slot]}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.discipline} className={sectionClass}>
          <h2 className={headingClass}>{section.label}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.slots.map((slot) => (
              <figure key={slot.key}>
                {slot.kind === 'image' ? <img src={slot.file?.url} alt={slot.label} className="aspect-video w-full rounded-xl bg-black object-cover" /> : null}
                {slot.kind === 'video' ? <video src={slot.file?.url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" /> : null}
                {slot.kind === 'audio' ? <audio src={slot.file?.url} controls preload="metadata" className="w-full" /> : null}
                <figcaption className="mt-1 text-xs text-slate-400">{slot.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      {portfolio.showreel_links.length ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Showreels</h2>
          <ul className="space-y-1 text-sm">
            {portfolio.showreel_links.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="noopener noreferrer" className="break-all text-violet-300 hover:underline">
                  {link}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portfolio.documents.length ? (
        <section className={sectionClass}>
          <h2 className={headingClass}>Certificates & achievements</h2>
          <ul className="space-y-1 text-sm">
            {portfolio.documents.map((document) => (
              <li key={document.id}>
                <a href={document.file} target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:underline">
                  {document.title}
                </a>{' '}
                <span className="text-slate-400">· {document.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? <p className="text-sm text-slate-400">No portfolio uploads yet.</p> : null}
    </div>
  );
}
