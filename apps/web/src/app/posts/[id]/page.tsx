'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ApiError, apiClient } from '@bharini/api-client';
import { readSession } from '@bharini/auth';
import type { Post } from '@bharini/types';

import { AppHeader } from '@/components/app-header';
import { PostCard } from '@/components/post-card';
import { ErrorBanner, errorMessage } from '@/components/profile-fields';

/** Where shared post links land. */
function PostPageContent() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readSession().accessToken) {
      router.replace('/auth/login');
      return;
    }
    let cancelled = false;
    apiClient
      .getPost(Number(id))
      .then((response) => {
        if (!cancelled && response.data) setPost(response.data);
      })
      .catch((caughtError) => {
        if (cancelled) return;
        if (caughtError instanceof ApiError && caughtError.status === 401) router.replace('/auth/login');
        else setError(errorMessage(caughtError, 'Could not load this post.'));
      });
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AppHeader />
        {error ? <ErrorBanner message={error} /> : null}
        {post ? (
          <PostCard post={post} onChanged={setPost} onDeleted={() => router.replace('/home')} />
        ) : !error ? (
          <p className="py-20 text-center text-slate-300">Loading post…</p>
        ) : null}
      </div>
    </main>
  );
}

// cacheComponents: useParams needs a Suspense boundary, the id is only known at request time
export default function PostPage() {
  return (
    <Suspense fallback={<p className="min-h-screen bg-slate-950 py-20 text-center text-slate-300">Loading post…</p>}>
      <PostPageContent />
    </Suspense>
  );
}
