'use client';

import { useRouter } from 'next/navigation';

/** Back to wherever the reader came from (settings, register…); the landing page only when opened directly. */
export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
      className="text-sm text-violet-300 hover:text-violet-200"
    >
      ← Back
    </button>
  );
}
