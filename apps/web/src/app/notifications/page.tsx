'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { NotificationItem } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/artist-post-card';
import { ErrorBanner, errorMessage } from '@/components/profile-fields';
import { profileHref } from '@/lib/routes';

/** Where a row leads: the post for likes and comments, the person for follows and connections. */
function hrefFor(item: NotificationItem) {
  const postId = item.data.post_id;
  if ((item.kind === 'likes' || item.kind === 'comments') && typeof postId === 'number') return `/posts/${postId}`;
  if (item.actor) return profileHref(item.actor);
  return '/home';
}

/** Likes, comments, follows, connections and casting calls; same list as the mobile bell. Opening it marks everything read. */
export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    apiClient
      .getNotifications()
      .then((response) => {
        if (cancelled) return;
        setItems(response.data?.notifications ?? []);
        void apiClient.markNotificationsRead().catch(() => undefined);
      })
      .catch((caughtError) => !cancelled && setError(errorMessage(caughtError, 'Could not load notifications.')));
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />
        <h1 className="text-3xl font-semibold">Notifications</h1>
        <ErrorBanner message={error} />
        {items === null && !error ? <p className="text-sm text-slate-400">Loading…</p> : null}
        {items?.length === 0 ? <p className="text-sm text-slate-400">No notifications yet.</p> : null}
        <ul className="space-y-2">
          {items?.map((item) => (
            <li key={item.id}>
              <Link href={hrefFor(item)} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 hover:border-slate-700">
                {item.actor ? <Avatar user={item.actor} size="h-10 w-10" /> : <span className="h-10 w-10 shrink-0 rounded-full bg-violet-500/30" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.body ? <span className="block truncate text-sm text-slate-400">{item.body}</span> : null}
                  <span className="block text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
                </span>
                {item.read ? null : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" aria-label="Unread" />}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
