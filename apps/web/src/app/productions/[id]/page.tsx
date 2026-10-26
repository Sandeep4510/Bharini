'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';

import { AppHeader } from '@/components/app-header';
import { ProductionProfileView } from '@/components/productions/production-profile-view';

function ProductionPageContent() {
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

// cacheComponents: useParams needs a Suspense boundary, the id is only known at request time
export default function ProductionPage() {
  return (
    <Suspense fallback={<p className="min-h-screen bg-slate-950 py-20 text-center text-slate-300">Loading profile…</p>}>
      <ProductionPageContent />
    </Suspense>
  );
}
