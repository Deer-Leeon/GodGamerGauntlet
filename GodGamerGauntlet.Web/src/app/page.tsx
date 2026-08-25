"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  CommentThread,
  ReactionBar,
  VoteColumn,
  timeAgo,
} from "@/components/RunSocial";
import { getFeed, type FeedPost, type FeedSort } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

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
            currentUserId={user?.id ?? null}
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
  currentUserId,
  onPatch,
}: {
  post: FeedPost;
  currentUserId: string | null;
  onPatch: (patch: Partial<FeedPost>) => void;
}) {
  const completed = post.status === "Completed";
  const signedIn = !!currentUserId;

  return (
    <article className="panel rounded-2xl p-5">
      <div className="flex gap-4">
        <VoteColumn post={post} signedIn={signedIn} onPatch={onPatch} />

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

          <Link
            href={`/run/${post.runId}`}
            className="mt-2 block rounded-lg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent-win/50"
          >
            <p className="font-heading text-lg font-bold">
              {completed
                ? "Conquered the full gauntlet"
                : `Died on game ${post.slotsCompleted + 1} of 10`}
              <span className="ml-2 font-mono text-base text-accent-win">
                {post.totalScore.toLocaleString()} pts
              </span>
            </p>
            <div className="mt-3 flex gap-1">
              {post.slotStatuses.map((status, i) => {
                const thumb = post.slotThumbs?.[i] ?? null;
                const title = post.slotTitles?.[i] ?? `Slot ${i + 1}`;
                const ring =
                  status === "Won"
                    ? "ring-accent-win"
                    : status === "Lost"
                      ? "ring-accent-death"
                      : "ring-white/15";
                return (
                  <span
                    key={i}
                    title={`${i + 1}. ${title} — ${status}`}
                    className={`relative h-11 flex-1 overflow-hidden rounded-sm ring-1 ${ring} ${
                      status === "Pending" ? "opacity-40" : ""
                    }`}
                  >
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt=""
                        fill
                        unoptimized
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center bg-white/5 text-[10px] font-bold text-gray-500">
                        {i + 1}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">View lineup →</p>
          </Link>

          <FooterBar
            post={post}
            currentUserId={currentUserId}
            onPatch={onPatch}
          />
        </div>
      </div>
    </article>
  );
}

function FooterBar({
  post,
  currentUserId,
  onPatch,
}: {
  post: FeedPost;
  currentUserId: string | null;
  onPatch: (patch: Partial<FeedPost>) => void;
}) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="mt-3">
      <ReactionBar
        post={post}
        currentUserId={currentUserId}
        commentsOpen={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
        onPatch={onPatch}
      />
      {showComments && (
        <CommentThread
          runId={post.runId}
          currentUserId={currentUserId}
          onCountChange={(count) => onPatch({ commentCount: count })}
        />
      )}
    </div>
  );
}

