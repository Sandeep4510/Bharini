'use client';

import { useEffect, useState } from 'react';

import type { CursorPage, Post } from '@bharini/types';

import { PostCard } from '@/components/post-card';

export const EMPTY_PAGE: CursorPage<Post> = { next: null, previous: null, results: [] };

export function cursorFrom(url: string | null): string | null {
  return url ? new URL(url).searchParams.get('cursor') : null;
}

type PostListProps = {
  loadPage: (cursor: string | null) => Promise<CursorPage<Post>>;
  refreshKey?: number;
  emptyText: string;
};

export function PostList({ loadPage, refreshKey = 0, emptyText }: PostListProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadPage(null)
      .then((page) => {
        if (!active) return;
        setPosts(page.results);
        setNextCursor(cursorFrom(page.next));
        setError(null);
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [loadPage, refreshKey]);

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      const page = await loadPage(nextCursor);
      setPosts((current) => [...current, ...page.results]);
      setNextCursor(cursorFrom(page.next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more posts.');
    }
  };

  if (isLoading) return <p className="text-sm text-slate-400">Loading posts…</p>;
  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (posts.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div key={post.id} id={`post-${post.id}`}>
          <PostCard post={post} />
        </div>
      ))}
      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="w-full rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
        >
          Load more
        </button>
      )}
    </div>
  );
}
