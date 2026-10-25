'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { ChatMessage, ConnectionRequest, Conversation, FollowerResult } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/artist-post-card';
import { SharedPostCard } from '@/components/chat-bits';
import { ConnectButton } from '@/components/connect-button';
import { ErrorBanner, errorMessage, inputClass, okBorder, primaryButton } from '@/components/profile-fields';
import { profileHref } from '@/lib/routes';

// shortcut: polling, not websockets; move to Django Channels once chats need instant delivery at scale
const THREAD_POLL_MS = 5000;
const LIST_POLL_MS = 15000;

function preview(message: ChatMessage | null) {
  if (!message) return 'No messages yet';
  const text = message.body || (message.shared ? `Shared a post by ${message.shared.author_name}` : '');
  return `${message.is_mine ? 'You: ' : ''}${text}`;
}

function Thread({ conversation, onActivity }: { conversation: Conversation; onActivity: (message: ChatMessage) => void }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const append = (incoming: ChatMessage[]) => {
      if (cancelled || !incoming.length) return;
      lastIdRef.current = incoming[incoming.length - 1].id;
      setMessages((previous) => [...(previous ?? []), ...incoming.filter((item) => !previous?.some((old) => old.id === item.id))]);
    };
    let loaded = false;
    lastIdRef.current = 0;
    apiClient
      .getMessages(conversation.id)
      .then((response) => {
        if (cancelled) return;
        loaded = true;
        setMessages([]);
        append(response.data?.messages ?? []);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(errorMessage(caughtError, 'Could not load messages.'));
      });
    const timer = window.setInterval(() => {
      if (!loaded) return;
      apiClient
        .getMessages(conversation.id, lastIdRef.current || undefined)
        .then((response) => append(response.data?.messages ?? []))
        .catch(() => undefined); // a missed poll is retried on the next tick
    }, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.sendMessage(conversation.id, draft.trim());
      const sent = response.data;
      if (sent) {
        lastIdRef.current = Math.max(lastIdRef.current, sent.id);
        setMessages((previous) => [...(previous ?? []), sent]);
        onActivity(sent);
      }
      setDraft('');
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not send.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-slate-800 p-4">
        <Link href="/messages" className="text-slate-400 hover:text-white sm:hidden" aria-label="Back to chats">
          ←
        </Link>
        <Link href={profileHref(conversation.other)} className="flex min-w-0 items-center gap-3 hover:opacity-90">
          <Avatar user={conversation.other} size="h-9 w-9" />
          <span className="truncate font-semibold">{conversation.other.name}</span>
        </Link>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {messages === null && !error ? <p className="text-sm text-slate-400">Loading…</p> : null}
        {messages?.length === 0 ? <p className="text-sm text-slate-400">Say hello to {conversation.other.name}.</p> : null}
        {messages?.map((message) => (
          <div key={message.id} className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${message.is_mine ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-100'}`}>
              {message.body ? <p className="whitespace-pre-line break-words text-sm">{message.body}</p> : null}
              {message.shared ? <SharedPostCard shared={message.shared} /> : null}
              <p className={`mt-1 text-[11px] ${message.is_mine ? 'text-violet-200' : 'text-slate-400'}`}>
                {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {message.is_mine && message.read ? ' · Seen' : ''}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error ? <div className="px-4"><ErrorBanner message={error} /></div> : null}
      {conversation.can_message ? null : (
        <p className="border-t border-slate-800 px-4 pt-3 text-sm text-slate-400">
          You are not connected with {conversation.other.name}.{' '}
          <Link href={profileHref(conversation.other)} className="text-violet-300 hover:underline">
            Connect
          </Link>{' '}
          to send messages.
        </p>
      )}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          disabled={!conversation.can_message}
          placeholder="Write a message…"
          aria-label="Write a message"
          className={`${inputClass} ${okBorder} flex-1 disabled:opacity-50`}
        />
        <button type="submit" disabled={busy || !draft.trim() || !conversation.can_message} className={primaryButton}>
          Send
        </button>
      </form>
    </div>
  );
}

/** Find someone among your followers and open a chat with them. */
function FollowerSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FollowerResult[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.searchFollowers(query.trim());
      setResults(response.data?.followers ?? []);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not search your followers.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-slate-800 p-3">
      <form onSubmit={search} role="search" className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={100}
          placeholder="Search your followers"
          aria-label="Search your followers"
          className={`${inputClass} ${okBorder} min-w-0 flex-1 text-sm`}
        />
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? '…' : 'Search'}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
      {results ? (
        <ul className="mt-2 space-y-1">
          {results.length === 0 ? <li className="px-1 py-2 text-sm text-slate-400">No followers match.</li> : null}
          {results.map((person) => (
            <li key={person.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Link href={profileHref(person)} aria-label={`${person.name}'s profile`}>
                <Avatar user={person} size="h-8 w-8" />
              </Link>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{person.name}</span>
                {person.username ? <span className="block truncate text-xs text-slate-400">@{person.username}</span> : null}
              </span>
              {/* messaging needs an accepted connection; everyone else gets the Connect button */}
              {person.connection === 'connected' ? (
                <Link href={`/messages?with=${person.id}`} className="text-xs font-semibold text-violet-300 hover:text-violet-200">
                  Message
                </Link>
              ) : (
                <ConnectButton
                  compact
                  userId={person.id}
                  status={person.connection}
                  onChange={(connection) =>
                    setResults((previous) => previous?.map((item) => (item.id === person.id ? { ...item, connection } : item)) ?? null)
                  }
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Requests waiting for your answer; accepting unlocks messaging. */
function ConnectionRequests() {
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getConnectionRequests()
      .then((response) => {
        if (!cancelled) setRequests(response.data?.requests ?? []);
      })
      .catch(() => undefined); // the list is a hint; profiles still offer Accept
    return () => {
      cancelled = true;
    };
  }, []);

  if (!requests.length) return null;
  return (
    <div className="border-b border-slate-800 p-3">
      <p className="px-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Connection requests · {requests.length}</p>
      <ul className="mt-2 space-y-2">
        {requests.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center gap-3 px-1">
            <Link href={profileHref(person)} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90">
              <Avatar user={person} size="h-8 w-8" />
              <span className="truncate text-sm font-medium">{person.name}</span>
            </Link>
            <ConnectButton
              compact
              userId={person.id}
              status="pending_received"
              onChange={() => setRequests((previous) => previous.filter((item) => item.id !== person.id))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const withUser = Number(params.get('with')) || 0;
  const activeId = Number(params.get('c')) || 0;
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    const load = () =>
      apiClient
        .getConversations()
        .then((response) => {
          if (!cancelled) setConversations(response.data?.conversations ?? []);
        })
        .catch((caughtError) => {
          if (cancelled) return;
          if (caughtError instanceof ApiError && caughtError.status === 401) router.replace('/auth/login');
          else setError(errorMessage(caughtError, 'Could not load your chats.'));
        });
    void load();
    const timer = window.setInterval(() => void load(), LIST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  // ?with=<user id> comes from a profile's Message button: open (or create) that chat
  useEffect(() => {
    if (!withUser) return;
    apiClient
      .startConversation(withUser)
      .then((response) => {
        const started = response.data;
        if (!started) return;
        setConversations((previous) => [started, ...(previous ?? []).filter((item) => item.id !== started.id)]);
        router.replace(`/messages?c=${started.id}`);
      })
      .catch((caughtError) => setError(errorMessage(caughtError, 'Could not open this chat.')));
  }, [withUser, router]);

  const active = conversations?.find((item) => item.id === activeId) ?? null;

  const onActivity = (message: ChatMessage) =>
    setConversations((previous) => {
      const current = previous?.find((item) => item.id === activeId);
      return current ? [{ ...current, last_message: message, unread_count: 0 }, ...(previous ?? []).filter((item) => item.id !== activeId)] : previous;
    });

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader />
        {error ? <ErrorBanner message={error} /> : null}

        <div className="grid h-[70vh] min-h-[420px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 sm:grid-cols-[300px_1fr]">
          <aside className={`min-h-0 overflow-y-auto border-slate-800 sm:border-r ${active ? 'hidden sm:block' : ''}`}>
            <h1 className="border-b border-slate-800 p-4 text-lg font-semibold">Messages</h1>
            <ConnectionRequests />
            <FollowerSearch />
            {conversations === null && !error ? <p className="p-4 text-sm text-slate-400">Loading chats…</p> : null}
            {conversations?.length === 0 ? (
              <p className="p-4 text-sm text-slate-400">No chats yet. Search your followers above to start one.</p>
            ) : null}
            <ul>
              {conversations?.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    href={`/messages?c=${conversation.id}`}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60 ${conversation.id === activeId ? 'bg-slate-800/80' : ''}`}
                  >
                    <Avatar user={conversation.other} size="h-10 w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{conversation.other.name}</span>
                      <span className={`block truncate text-xs ${conversation.unread_count && conversation.id !== activeId ? 'font-semibold text-white' : 'text-slate-400'}`}>
                        {preview(conversation.last_message)}
                      </span>
                    </span>
                    {conversation.unread_count && conversation.id !== activeId ? (
                      <span className="rounded-full bg-violet-500 px-2 py-0.5 text-xs font-semibold" aria-label={`${conversation.unread_count} unread`}>
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <section className={`min-h-0 ${active ? '' : 'hidden sm:block'}`}>
            {active ? (
              <Thread key={active.id} conversation={active} onActivity={onActivity} />
            ) : (
              <p className="flex h-full items-center justify-center p-6 text-center text-slate-400">Pick a chat to start messaging.</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

// cacheComponents: useSearchParams needs a Suspense boundary
export default function MessagesPage() {
  return (
    <Suspense fallback={<p className="min-h-screen bg-slate-950 py-20 text-center text-slate-300">Loading messages…</p>}>
      <MessagesContent />
    </Suspense>
  );
}
