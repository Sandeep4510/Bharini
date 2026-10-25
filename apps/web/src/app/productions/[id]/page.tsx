'use client';

import { useParams } from 'next/navigation';

import { AppHeader } from '@/components/app-header';
import { ProductionProfileView } from '@/components/productions/production-profile-view';

export default function ProductionPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <AppHeader />
        <ProductionProfileView productionId={Number(id)} />
      </div>
    </main>
  );
}
