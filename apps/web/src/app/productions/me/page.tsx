'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { Production } from '@bharini/types';

import { ProductionForm } from '@/components/productions/production-form';
import { ProductionProfileView } from '@/components/productions/production-profile-view';

export default function MyProductionPage() {
  const [production, setProduction] = useState<Production | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getMyProduction()
      .then((res) => setProduction(res.data ?? null))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/home" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
              B
            </span>
            <span>Bharini</span>
          </Link>
        </header>

        <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-4 shadow-2xl shadow-violet-950/20 sm:p-6 lg:p-8">
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {!error && production === undefined && <p className="text-sm text-slate-400">Loading profile…</p>}
          {!error && production === null && <ProductionForm onSaved={setProduction} />}
          {!error && production && <ProductionProfileView productionId={production.id} />}
        </div>
      </div>
    </main>
  );
}
