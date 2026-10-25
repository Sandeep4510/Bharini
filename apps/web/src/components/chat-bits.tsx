/* eslint-disable @next/next/no-img-element -- shared post images are served by the API host */
import Link from 'next/link';

import type { ChatMessage } from '@bharini/types';

/** The preview card of a post sent in chat. */
export function SharedPostCard({ shared }: { shared: NonNullable<ChatMessage['shared']> }) {
  return (
    <Link href={shared.url} className="mt-1 block overflow-hidden rounded-xl border border-slate-700 bg-slate-950/70 text-left hover:border-violet-400">
      {shared.image ? <img src={shared.image} alt="" className="max-h-40 w-full object-cover" /> : null}
      <div className="p-3">
        <p className="text-xs font-semibold text-violet-200">{shared.author_name}</p>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-200">{shared.body || 'View post'}</p>
      </div>
    </Link>
  );
}
