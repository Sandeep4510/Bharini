'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/components/auth-provider';

export default function DashboardPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <p className="text-sm uppercase tracking-[0.16em] text-violet-300">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome to Bharini</h1>
        <p className="mt-4 text-slate-300">
          {user
            ? `Signed in as ${user.first_name} ${user.last_name} (${user.email}).`
            : 'Your session is active. We are loading your profile details.'}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
          >
            Back to home
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Logout
          </button>
        </div>
      </div>
    </main>
  );
}
