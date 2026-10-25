'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { SharedPostRef, UserSummary } from '@bharini/types';

import { Avatar } from '@/components/artist-post-card';
import { errorMessage, inputClass, okBorder, secondaryButton } from '@/components/profile-fields';

const smallSend = 'rounded-lg bg-violet-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50';

/**
 * "Share" on a post. Sending it to a connection in a Bharini message comes first;
 * copying the link and the device share sheet follow.
 */
export function ShareButton({
  post,
  path,
  title,
  className,
  label = '↗ Share',
  onShared,
}: {
  post: SharedPostRef;
  path: string;
  title: string;
  className: string;
  label?: string;
  onShared?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        {label}
      </button>
      {open ? <ShareDialog post={post} path={path} title={title} onShared={onShared} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ShareDialog({
  post,
  path,
  title,
  onShared,
  onClose,
}: {
  post: SharedPostRef;
  path: string;
  title: string;
  onShared?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<UserSummary[] | null>(null);
  const [note, setNote] = useState('');
  const [sentTo, setSentTo] = useState<number[]>([]);
  const [sending, setSending] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}${path}`;

  const load = (q: string) =>
    apiClient
      .getMyConnections(q)
      .then((response) => setPeople(response.data?.connections ?? []))
      .catch((caughtError) => setError(errorMessage(caughtError, 'Could not load your connections.')));

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getMyConnections('')
      .then((response) => {
        if (!cancelled) setPeople(response.data?.connections ?? []);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(errorMessage(caughtError, 'Could not load your connections.'));
      });
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load(query.trim());
  };

  const send = async (person: UserSummary) => {
    setSending(person.id);
    setError('');
    try {
      const conversation = (await apiClient.startConversation(person.id)).data;
      if (conversation) await apiClient.sendMessage(conversation.id, note.trim(), post);
      setSentTo((previous) => [...previous, person.id]);
      onShared?.();
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not send.'));
    } finally {
      setSending(0);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied');
      onShared?.();
    } catch {
      setStatus(url);
    }
  };

  const shareElsewhere = async () => {
    // closing the device share sheet rejects; nothing to report
    await navigator.share({ title, url }).then(() => onShared?.(), () => undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share post"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-5 text-white"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Share post</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <section className="space-y-3">
          <p className="text-sm font-medium text-violet-200">✉ Send in a Bharini message</p>
          <form onSubmit={search} role="search" className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your connections"
              aria-label="Search your connections"
              className={`${inputClass} ${okBorder} min-w-0 flex-1 text-sm`}
            />
            <button type="submit" className={secondaryButton}>
              Search
            </button>
          </form>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder="Add a note (optional)"
            aria-label="Add a note"
            className={`${inputClass} ${okBorder} text-sm`}
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {people === null && !error ? <p className="text-sm text-slate-400">Loading connections…</p> : null}
          {people?.length === 0 ? (
            <p className="text-sm text-slate-400">{query ? 'No connections match.' : 'No connections yet. Connect with people to message them.'}</p>
          ) : null}
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {people?.map((person) => {
              const sent = sentTo.includes(person.id);
              return (
                <li key={person.id} className="flex items-center gap-3">
                  <Avatar user={person} size="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                  <button type="button" disabled={sent || sending === person.id} onClick={() => void send(person)} className={smallSend}>
                    {sent ? 'Sent' : sending === person.id ? '…' : 'Send'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <button type="button" onClick={() => void copyLink()} className={secondaryButton}>
            🔗 Copy link
          </button>
          {typeof navigator !== 'undefined' && 'share' in navigator ? (
            <button type="button" onClick={() => void shareElsewhere()} className={secondaryButton}>
              ↗ More options
            </button>
          ) : null}
          {status ? (
            <span className="break-all text-xs text-slate-400" role="status">
              {status}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
