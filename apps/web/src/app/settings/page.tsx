'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { UserSummary } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { Avatar } from '@/components/artist-post-card';
import { useAuth } from '@/components/auth-provider';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { dangerButton, ErrorBanner, errorMessage, primaryButton, secondaryButton } from '@/components/profile-fields';
import { profileHref } from '@/lib/routes';

const card = 'rounded-3xl border border-slate-800 bg-slate-900/70 p-6';

function BlockedAccounts() {
  const [people, setPeople] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getBlockedUsers()
      .then((response) => !cancelled && setPeople(response.data?.blocked ?? []))
      .catch((caughtError) => !cancelled && setError(errorMessage(caughtError, 'Could not load blocked accounts.')));
    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (person: UserSummary) => {
    setError('');
    try {
      await apiClient.setBlocked(person.id, false);
      setPeople((current) => current?.filter((item) => item.id !== person.id) ?? null);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not unblock.'));
    }
  };

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Blocked accounts</h2>
      <p className="mt-1 text-sm text-slate-400">You don&apos;t see their posts or messages, and they can&apos;t find you.</p>
      <div className="mt-4 space-y-2">
        <ErrorBanner message={error} />
        {people === null && !error ? <p className="text-sm text-slate-400">Loading…</p> : null}
        {people?.length === 0 ? <p className="text-sm text-slate-400">You haven&apos;t blocked anyone.</p> : null}
        {people?.map((person) => (
          <div key={person.id} className="flex items-center gap-3">
            <Link href={profileHref(person)} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar user={person} size="h-9 w-9" />
              <span className="truncate text-sm font-medium">{person.name}</span>
            </Link>
            <button type="button" onClick={() => void unblock(person)} className={secondaryButton}>
              Unblock
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeleteAccount({ onDeleted }: { onDeleted: (message: string) => void }) {
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className={`${card} border-red-500/30`}>
      <h2 className="text-lg font-semibold">Delete account</h2>
      <p className="mt-1 text-sm text-slate-400">
        Your profile, posts and messages are hidden right away. You have 90 days to change your mind.
      </p>
      <button type="button" onClick={() => setConfirming(true)} className={`${dangerButton} mt-4`}>
        Delete account
      </button>
      {confirming ? (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Yes, delete my account"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const response = await apiClient.deleteAccount();
            // the server already revoked every session; this only clears this browser
            await logout().catch(() => undefined);
            onDeleted(response.message);
          }}
        >
          <p>You will be logged out and your account will be hidden from everyone.</p>
          <p>
            You can log in again within 90 days by confirming the link we email you. After that, all your account
            details, including connections, posts and messages, are deleted forever.
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [deletedMessage, setDeletedMessage] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) router.replace('/auth/login');
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />
        <h1 className="text-3xl font-semibold">Settings</h1>
        {deletedMessage ? (
          <section className={card}>
            <h2 className="text-lg font-semibold">Account scheduled for deletion</h2>
            <p className="mt-2 text-sm text-slate-300">{deletedMessage}</p>
            <Link href="/auth/login" className={`${primaryButton} mt-4`}>
              Go to login
            </Link>
          </section>
        ) : (
          <>
            <BlockedAccounts />
            <DeleteAccount onDeleted={setDeletedMessage} />
            <p className="text-sm text-slate-400">
              <Link href="/terms" className="text-violet-300 hover:text-violet-200">
                Terms &amp; Conditions
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
