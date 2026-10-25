'use client';

import { useEffect, useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { Production } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
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
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader />
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {!error && production === undefined && <p className="text-sm text-slate-400">Loading profile…</p>}
        {!error && production === null && <ProductionForm onSaved={setProduction} />}
        {!error && production && <ProductionProfileView productionId={production.id} />}
      </div>
    </main>
  );
}
