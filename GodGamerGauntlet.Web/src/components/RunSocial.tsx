"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  addComment,
  deleteComment,
  editComment,
  getComments,
  toggleReaction,
  voteOnRun,
  type FeedPost,
  type ReactionType,
  type RunComment,
} from "@/lib/api";

export const REACTIONS: { type: ReactionType; emoji: string; title: string }[] =
  [
    { type: "fire", emoji: "🔥", title: "Fire run" },
    { type: "skull", emoji: "💀", title: "Brutal death" },
    { type: "crown", emoji: "👑", title: "God gamer" },
    { type: "gg", emoji: "🫡", title: "GG" },
  ];

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function VoteColumn({
  post,
  signedIn,
  onPatch,
  compact = false,
}: {
  post: FeedPost;
  signedIn: boolean;
  onPatch: (patch: Partial<FeedPost>) => void;
  compact?: boolean;
}) {
  async function castVote(direction: 1 | -1) {
    if (!signedIn) return;
    const next = post.myVote === direction ? 0 : direction;
    onPatch({
      myVote: next,
      voteScore: post.voteScore - post.myVote + next,
    });
    try {
      const result = await voteOnRun(post.runId, next as -1 | 0 | 1);
      onPatch({ voteScore: result.voteScore, myVote: result.myVote });
    } catch {
      onPatch({ voteScore: post.voteScore, myVote: post.myVote });
    }
  }

  return (
    <div className={`flex flex-col items-center ${compact ? "gap-0" : "gap-1"}`}>
      <VoteArrow
        direction={1}
        active={post.myVote === 1}
        disabled={!signedIn}
        compact={compact}
        onClick={() => castVote(1)}
      />
      <span
        className={`tabular-nums text-sm ${
          compact
            ? "font-medium text-gray-300"
            : "font-mono font-bold"
        } ${
          compact
            ? ""
            : post.voteScore > 0
              ? "text-accent-win"
              : post.voteScore < 0
                ? "text-accent-death"
                : "text-gray-400"
        }`}
      >
        {post.voteScore}
      </span>
      <VoteArrow
        direction={-1}
        active={post.myVote === -1}
        disabled={!signedIn}
        compact={compact}
        onClick={() => castVote(-1)}
      />
    </div>
  );
}

function VoteArrow({
  direction,
  active,
  disabled,
  compact,
  onClick,
}: {
  direction: 1 | -1;
  active: boolean;
  disabled: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const up = direction === 1;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Sign in to vote" : up ? "Upvote" : "Downvote"}
      className={`leading-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
        compact
          ? `px-1 py-0.5 text-xs ${
              active ? "text-gray-100" : "text-gray-600 hover:text-gray-300"
            }`
          : `rounded-md px-2 py-0.5 text-lg ${
              active
                ? up
                  ? "text-accent-win"
                  : "text-accent-death"
                : "text-gray-500 hover:text-gray-200"
            }`
      }`}
    >
      {up ? "▲" : "▼"}
    </button>
  );
}

export function ReactionBar({
  post,
  currentUserId,
  commentsOpen,
  onToggleComments,
  onPatch,
  compact = false,
}: {
  post: FeedPost;
  currentUserId: string | null;
  commentsOpen?: boolean;
  onToggleComments?: () => void;
  onPatch: (patch: Partial<FeedPost>) => void;
  compact?: boolean;
}) {
  const signedIn = !!currentUserId;

  async function onToggleReaction(type: ReactionType) {
    if (!signedIn) return;
    try {
      const result = await toggleReaction(post.runId, type);
      onPatch({ reactions: result.reactions, myReactions: result.myReactions });
    } catch {
      // leave state as-is
    }
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-x-4 gap-y-1" : "gap-2"}`}>
      {REACTIONS.map(({ type, emoji, title }) => {
        const count = post.reactions[type] ?? 0;
        const mine = post.myReactions.includes(type);
        return (
          <button
            key={type}
            onClick={() => onToggleReaction(type)}
            disabled={!signedIn}
            title={signedIn ? title : "Sign in to react"}
            className={
              compact
                ? `text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    mine ? "text-gray-100" : "text-gray-500 hover:text-gray-300"
                  }`
                : `flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition disabled:cursor-not-allowed ${
                    mine
                      ? "border-accent-win/60 bg-accent-win/10 text-accent-win"
                      : "border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200"
                  }`
            }
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className={compact ? "ml-1 tabular-nums" : "font-mono text-xs"}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      {onToggleComments && (
        <button
          onClick={onToggleComments}
          className={
            compact
              ? `ml-auto text-[13px] transition ${
                  commentsOpen ? "text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`
              : `ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${
                  commentsOpen
                    ? "border-accent-win/40 text-accent-win"
                    : "border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200"
                }`
          }
        >
          {compact ? (
            <>Comments {post.commentCount}</>
          ) : (
            <>
              💬
              <span className="font-mono text-xs">{post.commentCount}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

export function CommentThread({
  runId,
  currentUserId,
  onCountChange,
}: {
  runId: string;
  currentUserId: string | null;
  onCountChange: (count: number) => void;
}) {
  const [comments, setComments] = useState<RunComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const signedIn = !!currentUserId;

  useEffect(() => {
    getComments(runId)
      .then(setComments)
      .catch(() => setComments([]));
  }, [runId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const created = await addComment(runId, body);
      const next = [...(comments ?? []), created];
      setComments(next);
      onCountChange(next.length);
      setDraft("");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      {comments === null ? (
        <p className="text-sm text-gray-500">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isOwner={comment.userId === currentUserId}
              onSaved={(updated) =>
                setComments((prev) =>
                  (prev ?? []).map((c) => (c.id === updated.id ? updated : c)),
                )
              }
              onDeleted={() => {
                const next = (comments ?? []).filter((c) => c.id !== comment.id);
                setComments(next);
                onCountChange(next.length);
              }}
              onEdit={async (body) => editComment(runId, comment.id, body)}
              onDelete={() => deleteComment(runId, comment.id)}
            />
          ))}
        </ul>
      )}

      {signedIn ? (
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder="Add a comment…"
            className="panel min-w-0 flex-1 rounded-xl px-4 py-2 text-sm text-gray-100 outline-none transition focus:border-accent-win/60"
          />
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="rounded-xl bg-accent-win/15 px-4 py-2 text-sm font-semibold text-accent-win transition hover:bg-accent-win/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {posting ? "…" : "Post"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          <Link href="/login" className="text-accent-win hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  isOwner,
  onSaved,
  onDeleted,
  onEdit,
  onDelete,
}: {
  comment: RunComment;
  isOwner: boolean;
  onSaved: (updated: RunComment) => void;
  onDeleted: () => void;
  onEdit: (body: string) => Promise<RunComment>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await onEdit(body);
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this comment?")) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
      setSaving(false);
    }
  }

  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-heading font-bold text-gray-200">
          {comment.username}
        </span>
        <span className="text-xs text-gray-500">
          {timeAgo(comment.createdAt)}
        </span>
        {isOwner && !editing && (
          <span className="ml-auto flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setDraft(comment.body);
                setEditing(true);
                setError(null);
              }}
              className="text-gray-500 transition hover:text-accent-win"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="text-gray-500 transition hover:text-accent-death disabled:opacity-40"
            >
              Delete
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            rows={3}
            autoFocus
            className="panel w-full rounded-xl px-3 py-2 text-sm text-gray-100 outline-none transition focus:border-accent-win/60"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !draft.trim()}
              className="rounded-lg bg-accent-win/15 px-3 py-1 text-xs font-semibold text-accent-win transition hover:bg-accent-win/25 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body);
                setError(null);
              }}
              className="rounded-lg px-3 py-1 text-xs text-gray-400 transition hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-300">
          {comment.body}
        </p>
      )}

      {error && <p className="mt-1 text-xs text-accent-death">{error}</p>}
    </li>
  );
}
