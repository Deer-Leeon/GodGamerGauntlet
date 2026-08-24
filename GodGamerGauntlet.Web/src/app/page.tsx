"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  addComment,
  getComments,
  getFeed,
  toggleReaction,
  voteOnRun,
  type FeedPost,
  type FeedSort,
  type ReactionType,
  type RunComment,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

const REACTIONS: { type: ReactionType; emoji: string; title: string }[] = [
  { type: "fire", emoji: "🔥", title: "Fire run" },
  { type: "skull", emoji: "💀", title: "Brutal death" },
  { type: "crown", emoji: "👑", title: "God gamer" },
  { type: "gg", emoji: "🫡", title: "GG" },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function FeedPage() {
  const { user } = useAuth();

  const [sort, setSort] = useState<FeedSort>("hot");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeSort = useCallback((nextSort: FeedSort) => {
    setSort(nextSort);
    setLoading(true);
  }, []);

  // Reload when the sort changes and when auth state settles (to pick up myVote).
  useEffect(() => {
    let cancelled = false;
    getFeed(sort, 1)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.posts);
        setPage(1);
        setHasMore(result.hasMore);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          "Couldn't load the feed. The API may be waking up — try again in a few seconds.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, user]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const result = await getFeed(sort, page + 1);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.runId));
        return [...prev, ...result.posts.filter((p) => !seen.has(p.runId))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  function patchPost(runId: string, patch: Partial<FeedPost>) {
    setPosts((prev) =>
      prev.map((p) => (p.runId === runId ? { ...p, ...patch } : p)),
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      {/* Call to action for new visitors */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-6 py-5">
        <div>
          <h1 className="font-heading text-xl font-bold">
            Ten games. One run.{" "}
            <span className="text-accent-win">Zero excuses.</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Draft a 10-game gauntlet — every finished run lands here for the
            community to judge.
          </p>
        </div>
        <Link
          href="/draft"
          className="rounded-xl bg-accent-streak px-6 py-3 font-heading font-bold text-dark transition hover:brightness-110"
        >
          Enter the Draft Room
        </Link>
      </section>

      {/* Sort tabs */}
      <div className="mt-6 flex items-center gap-2">
        {SORTS.map((s) => (
          <button
            key={s.id}
            onClick={() => changeSort(s.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              sort === s.id
                ? "bg-accent-win/15 text-accent-win"
                : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="mt-4 flex flex-col gap-4">
        {loading && (
          <div className="panel rounded-2xl p-8 text-center text-sm text-gray-400">
            Loading the feed…
          </div>
        )}

        {!loading && error && (
          <div className="panel rounded-2xl p-8 text-center text-sm text-accent-death">
            {error}
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="panel rounded-2xl p-8 text-center text-sm text-gray-400">
            No finished runs yet. Be the first —{" "}
            <Link href="/draft" className="text-accent-win hover:underline">
              draft a gauntlet
            </Link>{" "}
            and make history.
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.runId}
            post={post}
            signedIn={!!user}
            onPatch={(patch) => patchPost(post.runId, patch)}
          />
        ))}

        {!loading && hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="panel rounded-xl px-6 py-3 text-sm font-semibold text-gray-300 transition hover:border-accent-win/40 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </main>
  );
}

function PostCard({
  post,
  signedIn,
  onPatch,
}: {
  post: FeedPost;
  signedIn: boolean;
  onPatch: (patch: Partial<FeedPost>) => void;
}) {
  const completed = post.status === "Completed";

  async function castVote(direction: 1 | -1) {
    if (!signedIn) return;
    const next = post.myVote === direction ? 0 : direction;
    // Optimistic update; reconcile with the server response.
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
    <article className="panel rounded-2xl p-5">
      <div className="flex gap-4">
        {/* Vote column */}
        <div className="flex flex-col items-center gap-1">
          <VoteArrow
            direction={1}
            active={post.myVote === 1}
            disabled={!signedIn}
            onClick={() => castVote(1)}
          />
          <span
            className={`font-mono text-sm font-bold ${
              post.voteScore > 0
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
            onClick={() => castVote(-1)}
          />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-heading font-bold text-gray-100">
              {post.streamerName}
            </span>
            <span className="text-gray-500">{timeAgo(post.endTime)}</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                completed
                  ? "bg-accent-streak/15 text-accent-streak"
                  : "bg-accent-death/15 text-accent-death"
              }`}
            >
              {completed ? "Completed" : "Failed"}
            </span>
          </div>

          <p className="mt-2 font-heading text-lg font-bold">
            {completed
              ? "Conquered the full gauntlet"
              : `Died on game ${post.slotsCompleted + 1} of 10`}
            <span className="ml-2 font-mono text-base text-accent-win">
              {post.totalScore.toLocaleString()} pts
            </span>
          </p>

          {/* Slot strip */}
          <div className="mt-3 flex gap-1.5">
            {post.slotStatuses.map((status, i) => (
              <span
                key={i}
                title={`Slot ${i + 1}: ${status}`}
                className={`h-2.5 flex-1 rounded-sm ${
                  status === "Won"
                    ? "bg-accent-win"
                    : status === "Lost"
                      ? "bg-accent-death"
                      : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <FooterBar post={post} signedIn={signedIn} onPatch={onPatch} />
        </div>
      </div>
    </article>
  );
}

function VoteArrow({
  direction,
  active,
  disabled,
  onClick,
}: {
  direction: 1 | -1;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const up = direction === 1;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Sign in to vote" : up ? "Upvote" : "Downvote"}
      className={`rounded-md px-2 py-0.5 text-lg leading-none transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? up
            ? "text-accent-win"
            : "text-accent-death"
          : "text-gray-500 hover:text-gray-200"
      }`}
    >
      {up ? "▲" : "▼"}
    </button>
  );
}

function FooterBar({
  post,
  signedIn,
  onPatch,
}: {
  post: FeedPost;
  signedIn: boolean;
  onPatch: (patch: Partial<FeedPost>) => void;
}) {
  const [showComments, setShowComments] = useState(false);

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
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {REACTIONS.map(({ type, emoji, title }) => {
          const count = post.reactions[type] ?? 0;
          const mine = post.myReactions.includes(type);
          return (
            <button
              key={type}
              onClick={() => onToggleReaction(type)}
              disabled={!signedIn}
              title={signedIn ? title : "Sign in to react"}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition disabled:cursor-not-allowed ${
                mine
                  ? "border-accent-win/60 bg-accent-win/10 text-accent-win"
                  : "border-white/10 text-gray-400 hover:border-white/25 hover:text-gray-200"
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="font-mono text-xs">{count}</span>}
            </button>
          );
        })}

        <button
          onClick={() => setShowComments((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-sm text-gray-400 transition hover:border-white/25 hover:text-gray-200"
        >
          💬
          <span className="font-mono text-xs">{post.commentCount}</span>
        </button>
      </div>

      {showComments && (
        <CommentThread
          runId={post.runId}
          signedIn={signedIn}
          onCountChange={(count) => onPatch({ commentCount: count })}
        />
      )}
    </>
  );
}

function CommentThread({
  runId,
  signedIn,
  onCountChange,
}: {
  runId: string;
  signedIn: boolean;
  onCountChange: (count: number) => void;
}) {
  const [comments, setComments] = useState<RunComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

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
            <li key={comment.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-heading font-bold text-gray-200">
                  {comment.username}
                </span>
                <span className="text-xs text-gray-500">
                  {timeAgo(comment.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-300">
                {comment.body}
              </p>
            </li>
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
