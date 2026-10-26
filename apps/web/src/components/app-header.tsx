'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { useAuth } from '@/components/auth-provider';
import { secondaryButton } from '@/components/profile-fields';

/** Header for signed-in pages: the logo leads back to /home and shows the user's first name ("Hi <name>" with `greet`). */
export function AppHeader({ greet = false }: { greet?: boolean }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      apiClient
        .getUnreadMessageCount()
        .then((response) => {
          if (!cancelled) setUnread(response.data?.unread ?? 0);
        })
        .catch(() => undefined); // the badge is a hint; skip a failed check
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <header className="flex items-center justify-between gap-3">
      <Link href="/home" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
          B
        </span>
        <span>{user?.first_name ? `${greet ? 'Hi ' : ''}${user.first_name}` : 'Bharini'}</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/home" className="text-slate-300 hover:text-white">
          Home
        </Link>
        <Link href="/messages" className="relative text-slate-300 hover:text-white">
          Messages
          {unread ? (
            <span className="absolute -right-3 -top-2 rounded-full bg-violet-500 px-1.5 text-[10px] font-semibold text-white" aria-label={`${unread} unread`}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Link>
        {user?.role === 'artist' ? (
          <Link href="/dashboard" className="text-slate-300 hover:text-white">
            My Profile
          </Link>
        ) : null}
        {user?.role === 'production_house' ? (
          <Link href="/search" className="text-slate-300 hover:text-white">
            Search
          </Link>
        ) : null}
        {user?.role === 'production_house' ? (
          <Link href="/productions/me" className="text-slate-300 hover:text-white">
            My Profile
          </Link>
        ) : null}
        <button type="button" onClick={() => void handleLogout()} className={secondaryButton}>
          Logout
        </button>
      </nav>
    </header>
  );
}
