'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';
import { secondaryButton } from '@/components/profile-fields';

/** Header for signed-in pages: the logo always leads back to /home. */
export function AppHeader() {
  const router = useRouter();
  const { user, logout } = useAuth();

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
        <span>Bharini</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/home" className="text-slate-300 hover:text-white">
          Home
        </Link>
        {user?.role === 'artist' ? (
          <Link href="/dashboard" className="text-slate-300 hover:text-white">
            My profile
          </Link>
        ) : null}
        {user?.role === 'production_house' ? (
          <Link href="/search" className="text-slate-300 hover:text-white">
            Search
          </Link>
        ) : null}
        {user?.role === 'production_house' ? (
          <Link href="/productions/me" className="text-slate-300 hover:text-white">
            Production profile
          </Link>
        ) : null}
        <button type="button" onClick={() => void handleLogout()} className={secondaryButton}>
          Logout
        </button>
      </nav>
    </header>
  );
}
