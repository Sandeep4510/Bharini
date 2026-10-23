'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ProductionProfileView } from '@/components/productions/production-profile-view';

export default function ProductionPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
              B
            </span>
            <span>Bharini</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white">
            Back to dashboard →
          </Link>
        </div>
        <ProductionProfileView productionId={Number(id)} />
      </div>
    </main>
  );
}
