/* eslint-disable @next/next/no-img-element -- post images and avatars are served by the API host */
'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ArtistPost, ArtistPostComment, UserSummary } from '@bharini/types';

import {
  ErrorBanner,
  errorMessage,
  fieldErrorsFrom,
  inputClass,
  okBorder,
  primaryButton,
  secondaryButton,
} from '@/components/profile-fields';
import { CommentIcon, HeartIcon } from '@/components/post-icons';
import { ShareButton } from '@/components/share-menu';
import { profileHref } from '@/lib/routes';

export const BODY_LIMIT = 5000;
const COMMENT_LIMIT = 1000;

const smallButton = 'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50';
const actionButton =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50';

export function Avatar({ user, size = 'h-10 w-10' }: { user: UserSummary; size?: string }) {
  return user.profile_photo ? (
    <img src={user.profile_photo} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-violet-500/30 font-semibold text-violet-100`}
      aria-hidden
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Apply a changed post to a list; a follow change applies to every post by that author. */
export function replacePost(posts: ArtistPost[], changed: ArtistPost) {
  return posts.map((item) =>
    item.id === changed.id ? changed : item.author.id === changed.author.id ? { ...item, author_followed: changed.author_followed } : item,
  );
}

function AuthorLine({ post, onChanged }: { post: ArtistPost; onChanged: (post: ArtistPost) => void }) {
  const user = post.author;
  const [busy, setBusy] = useState(false);

  const toggleFollow = async () => {
    setBusy(true);
    try {
      const response = await apiClient.setFollow(user.id, !post.author_followed);
      if (response.data) onChanged({ ...post, author_followed: response.data.is_following });
    } catch {
      // the button keeps its old state; a retry is one click away
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link href={profileHref(user)} aria-label={`${user.name}'s profile`}>
        <Avatar user={user} />
      </Link>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={profileHref(user)} className="truncate font-semibold text-white hover:underline">
            {user.name}
          </Link>
          {post.is_mine ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleFollow()}
              aria-pressed={post.author_followed}
              className={`shrink-0 text-xs font-semibold transition disabled:opacity-50 ${
                post.author_followed ? 'text-slate-400 hover:text-slate-200' : 'text-violet-300 hover:text-violet-200'
              }`}
            >
              · {post.author_followed ? 'Following' : '+ Follow'}
            </button>
          )}
        </div>
        <p className="truncate text-xs text-slate-400">
          {user.username ? `@${user.username} · ` : ''}
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function Comments({ post, onCount }: { post: ArtistPost; onCount: (count: number) => void }) {
  const [comments, setComments] = useState<ArtistPostComment[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getComments(post.id)
      .then((response) => {
        if (!cancelled) setComments(response.data?.comments ?? []);
      })
      .catch((caughtError) => {
        if (!cancelled) setError(errorMessage(caughtError, 'Could not load comments.'));
      });
    return () => {
      cancelled = true;
    };
  }, [post.id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.addArtistComment(post.id, body.trim());
      const added = response.data;
      if (added) {
        const next = [...(comments ?? []), added];
        setComments(next);
        onCount(next.length);
      }
      setBody('');
    } catch (caughtError) {
      setError(Object.values(fieldErrorsFrom(caughtError))[0] || errorMessage(caughtError, 'Could not comment.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comment: ArtistPostComment) => {
    try {
      await apiClient.deleteComment(post.id, comment.id);
      const next = (comments ?? []).filter((item) => item.id !== comment.id);
      setComments(next);
      onCount(next.length);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not delete comment.'));
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
      {error ? <ErrorBanner message={error} /> : null}
      {comments === null && !error ? <p className="text-sm text-slate-400">Loading comments…</p> : null}
      {comments?.map((comment) => (
        <div key={comment.id} className="flex items-start gap-3">
          <Link href={profileHref(comment.author)} aria-label={`${comment.author.name}'s profile`}>
            <Avatar user={comment.author} size="h-8 w-8" />
          </Link>
          <div className="min-w-0 flex-1 rounded-xl bg-slate-800/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <Link
                href={profileHref(comment.author)}
                className="truncate text-sm font-semibold text-white hover:underline"
              >
                {comment.author.name}
              </Link>
              {comment.can_delete ? (
                <button
                  type="button"
                  onClick={() => void remove(comment)}
                  aria-label="Delete comment"
                  title="Delete"
                  className="text-xs text-slate-400 hover:text-red-300"
                >
                  🗑️
                </button>
              ) : null}
            </div>
            <p className="whitespace-pre-line text-sm text-slate-100">{comment.body}</p>
          </div>
        </div>
      ))}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={COMMENT_LIMIT}
          placeholder="Write a comment…"
          aria-label="Write a comment"
          className={`${inputClass} ${okBorder} flex-1`}
        />
        <button type="submit" disabled={busy || !body.trim()} className={primaryButton}>
          Send
        </button>
      </form>
    </div>
  );
}

/** A post with like, comment and share; edit and delete show only on your own posts. */
export function PostCard({
  post,
  onChanged,
  onDeleted,
}: {
  post: ArtistPost;
  onChanged: (post: ArtistPost) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(post.body);
  const [media, setMedia] = useState<File | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setBody(post.body);
    setMedia(null);
    setRemoveMedia(false);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    if (!body.trim()) return setError('Write something to post.');
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.updatePost(post.id, { body: body.trim(), media, removeMedia });
      if (response.data) onChanged(response.data);
      setEditing(false);
    } catch (caughtError) {
      setError(Object.values(fieldErrorsFrom(caughtError))[0] || errorMessage(caughtError, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.deletePost(post.id);
      onDeleted(post.id);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not delete.'));
      setBusy(false);
    }
  };

  const toggleLike = async () => {
    setBusy(true);
    try {
      const response = await apiClient.setLike(post.id, !post.liked);
      if (response.data) onChanged({ ...post, ...response.data });
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not update like.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article id={`post-${post.id}`} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <AuthorLine post={post} onChanged={onChanged} />
        {post.is_mine && !editing ? (
          <div className="flex shrink-0 gap-2">
            {confirmDelete ? (
              <>
                <span className="self-center text-xs text-slate-300">Delete this post?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove()}
                  className={`${smallButton} bg-red-500/80 text-white hover:bg-red-500`}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={`${smallButton} border border-slate-700 text-slate-200`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startEditing}
                  className={`${smallButton} border border-slate-700 text-slate-200 hover:border-slate-500`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={`${smallButton} border border-slate-700 text-slate-200 hover:border-red-400 hover:text-red-200`}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={BODY_LIMIT}
            rows={4}
            className={`${inputClass} ${okBorder} resize-y`}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className={`${secondaryButton} cursor-pointer`}>
              {media ? `📎 ${media.name}` : post.media ? '🖼️ Replace image / video' : '🖼️ Add image / video'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(event) => {
                  setMedia(event.target.files?.[0] ?? null);
                  setRemoveMedia(false);
                }}
              />
            </label>
            {post.media && !media ? (
              <label className="inline-flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={removeMedia}
                  onChange={(event) => setRemoveMedia(event.target.checked)}
                  className="h-4 w-4"
                />
                Remove attachment
              </label>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" disabled={busy} onClick={() => void save()} className={primaryButton}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-line text-slate-100">{post.body}</p>
          {post.media && post.media_kind === 'image' ? (
            <img src={post.media} alt="" className="mt-3 max-h-96 rounded-xl object-contain" />
          ) : null}
          {post.media && post.media_kind === 'video' ? (
            <video src={post.media} controls className="mt-3 max-h-96 w-full rounded-xl" />
          ) : null}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-800 pt-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleLike()}
          aria-pressed={post.liked}
          aria-label={post.liked ? 'Unlike' : 'Like'}
          title={post.liked ? 'Unlike' : 'Like'}
          className={`${actionButton} ${post.liked ? 'text-red-400' : ''}`}
        >
          <HeartIcon filled={post.liked} /> {post.like_count}
        </button>
        <button
          type="button"
          onClick={() => setShowComments((shown) => !shown)}
          aria-expanded={showComments}
          aria-label="Comments"
          title="Comments"
          className={actionButton}
        >
          <CommentIcon /> {post.comment_count}
        </button>
        <ShareButton post={{ kind: 'artist', id: post.id }} path={`/posts/${post.id}`} title={`Post by ${post.author.name}`} className={actionButton} />
      </div>

      {showComments ? <Comments post={post} onCount={(count) => onChanged({ ...post, comment_count: count })} /> : null}
    </article>
  );
}
