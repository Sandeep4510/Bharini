'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { CastingCallDetails, Post, PostComment } from '@bharini/types';

import { CommentIcon, HeartIcon, SendIcon } from '@/components/post-icons';
import { ShareButton } from '@/components/share-menu';

const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function CastingDetails({ casting }: { casting: CastingCallDetails }) {
  const rows: [string, string][] = [
    ['Age', `${casting.age_min} – ${casting.age_max}`],
    ['Gender', label(casting.gender)],
    ['Languages', casting.languages],
    ['Location', casting.location],
    ['Approx pay', casting.approx_pay],
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rows.map(([name, value]) => (
        <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5">
          <dt className="text-xs uppercase tracking-[0.14em] text-violet-300">{name}</dt>
          <dd className="mt-1 break-words font-medium text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PostCard({ post: initial }: { post: Post }) {
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleLike = async () => {
    setError(null);
    try {
      const res = post.is_liked ? await apiClient.unlikePost(post.id) : await apiClient.likePost(post.id);
      if (res.data) setPost((current) => ({ ...current, ...res.data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update like.');
    }
  };

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (!next || commentsLoaded) return;
    try {
      const page = await apiClient.listComments(post.id);
      setComments(page.data?.results ?? []);
      setCommentsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load comments.');
    }
  };

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body) return;
    try {
      const res = await apiClient.addComment(post.id, body);
      if (res.data) {
        setComments((current) => [...current, res.data as PostComment]);
        setPost((current) => ({
          ...current,
          comment_count: current.comment_count + 1,
        }));
      }
      setCommentBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add comment.');
    }
  };

  const countShare = () =>
    apiClient
      .sharePost(post.id)
      .then((res) => setPost((current) => ({ ...current, share_count: res.data?.share_count ?? current.share_count })))
      .catch(() => undefined); // the count is cosmetic; the share itself already happened

  const { production } = post;
  const initialLetter = production.name.charAt(0).toUpperCase();

  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <Link href={`/productions/${production.id}`} className="flex items-center gap-3 hover:opacity-90">
          {production.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- media is served by the Django backend, not optimized by Next
            <img src={production.profile_picture} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-500 font-semibold">
              {initialLetter}
            </span>
          )}
          <span>
            <span className="block font-semibold text-white">{production.name}</span>
            <span className="block text-xs text-slate-400">
              {label(production.kind === 'house' ? 'production house' : 'individual')} ·{' '}
              {new Date(post.created_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </span>
        </Link>
        {post.post_type === 'casting_call' && (
          <span className="flex shrink-0 flex-wrap justify-end gap-2">
            {post.near_you ? (
              <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                📍 Near you
              </span>
            ) : null}
            <span className="rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
              Casting call
            </span>
          </span>
        )}
      </header>

      {post.body && <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-slate-100">{post.body}</p>}

      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element -- media is served by the Django backend, not optimized by Next
        <img src={post.image} alt="" className="mt-5 max-h-[32rem] w-full rounded-2xl object-cover" />
      )}

      {post.hashtags.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-violet-300">
          {post.hashtags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </p>
      )}

      {post.casting && <CastingDetails casting={post.casting} />}

      <footer className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4 text-sm">
        <button
          type="button"
          onClick={() => void toggleLike()}
          aria-pressed={post.is_liked}
          aria-label={post.is_liked ? 'Unlike' : 'Like'}
          title={post.is_liked ? 'Unlike' : 'Like'}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-slate-800 ${post.is_liked ? 'text-red-400' : 'text-slate-200'}`}
        >
          <HeartIcon filled={post.is_liked} /> {post.like_count}
        </button>
        <button
          type="button"
          onClick={() => void toggleComments()}
          aria-label="Comments"
          title="Comments"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-slate-200 hover:bg-slate-800"
        >
          <CommentIcon /> {post.comment_count}
        </button>
        <ShareButton
          post={{ kind: 'production', id: post.id }}
          path={`/productions/${production.id}#post-${post.id}`}
          title={`Post by ${production.name}`}
          label={
            <>
              <SendIcon /> {post.share_count}
            </>
          }
          onShared={() => void countShare()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-slate-200 hover:bg-slate-800"
        />
      </footer>

      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

      {showComments && (
        <section className="mt-4 space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-100">{comment.author_name}</span>{' '}
              <span className="text-slate-300">{comment.body}</span>
            </div>
          ))}
          <form onSubmit={(event) => void addComment(event)} className="flex gap-2">
            <input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              maxLength={500}
              placeholder="Write a comment"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-violet-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-400"
            >
              Post
            </button>
          </form>
        </section>
      )}
    </article>
  );
}
