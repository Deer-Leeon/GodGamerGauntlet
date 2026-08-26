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
import { formatSpeedrunTime } from "@/components/SpeedrunTimer";
import { getFeed, getLeaderboard, type FeedPost, type FeedSort, type LeaderboardEntry, type LiveRun, type RunType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import MomentChips from "@/components/MomentChips";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

export default function FeedPage() {
  const { user } = useAuth();

  const [sort, setSort] = useState<FeedSort>("hot");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [live, setLive] = useState<LiveRun[]>([]);
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
        setLive(result.live ?? []);
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
    <main className="feed-page mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Feed</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Live gauntlets and finished runs from the community.
          </p>
        </div>
        <Link
          href="/draft"
          className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Draft a run
        </Link>
      </header>

      <TopBoards />

      <div
        role="tablist"
        aria-label="Sort feed"
        className="mt-8 flex gap-6 border-b border-gold/20 text-sm"
      >
        {SORTS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sort === s.id}
            onClick={() => changeSort(s.id)}
            className={`-mb-px border-b-2 pb-3 transition ${
              sort === s.id
                ? "border-gold text-gold"
                : "border-transparent text-faint hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {!loading && live.length > 0 && (
        <div className="feed-list mt-5">
          {live.map((row) => (
            <Link
              key={row.runId}
              href={`/run/${row.runId}`}
              className="feed-row flex items-center gap-3 py-3 text-sm"
            >
              <span className="shrink-0 text-gold">Live</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">
                {row.streamerName}
              </span>
              <span className="shrink-0 text-faint">
                on game {row.currentSlot} of {row.totalSlots}
                {row.runType === "Lite" ? " · Lite" : ""}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="feed-list mt-5">
        {loading && (
          <p className="py-14 text-sm text-faint">Loading the feed…</p>
        )}

        {!loading && error && (
          <p className="py-12 text-sm text-red-400/90">{error}</p>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="py-14 text-sm text-faint">
            No finished runs yet.{" "}
            <Link href="/draft" className="text-gold underline underline-offset-2">
              Draft a gauntlet
            </Link>
            .
          </p>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.runId}
            post={post}
            currentUserId={user?.id ?? null}
            onPatch={(patch) => patchPost(post.runId, patch)}
          />
        ))}
      </div>

      {!loading && hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-8 w-full border border-gold/25 px-4 py-3 text-sm text-muted transition hover:border-gold/50 hover:text-gold disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
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
  const elapsedMs = feedElapsedMs(post);
  const isLite = post.runType === "Lite";

  return (
    <article className="feed-row py-6">
      <div className="flex gap-5">
        <VoteColumn
          post={post}
          signedIn={signedIn}
          onPatch={onPatch}
          compact
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            <Link
              href={`/u/${encodeURIComponent(post.streamerName)}`}
              className="font-medium text-ink hover:text-gold"
            >
              {post.streamerName}
            </Link>
            <span className="text-faint/70">·</span>
            <span className="text-faint">{timeAgo(post.endTime)}</span>
            <span className="text-faint/70">·</span>
            <span className={completed ? "text-gold" : "text-red-400/80"}>
              {completed ? "Clear" : "DNF"}
            </span>
            {completed && post.boardRank != null && (
              <>
                <span className="text-faint/70">·</span>
                <span className="font-mono tabular-nums text-gold">
                  #{post.boardRank}
                </span>
              </>
            )}
            {completed && post.boardRank == null && post.wouldBeRank != null && (
              <>
                <span className="text-faint/70">·</span>
                <span className="tabular-nums text-faint">
                  would #{post.wouldBeRank}
                </span>
              </>
            )}
            {isLite && (
              <>
                <span className="text-faint/70">·</span>
                <span className="text-faint">Lite</span>
              </>
            )}
          </div>

          {(post.moments ?? []).length > 0 && (
            <div className="mt-2.5">
              <MomentChips moments={post.moments} />
            </div>
          )}

          <Link
            href={`/run/${post.runId}`}
            className="mt-2.5 block outline-none"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-base leading-snug text-ink">
                {completed
                  ? `${post.totalSlots}/${post.totalSlots} games`
                  : `Stopped on game ${post.slotsCompleted + 1} of ${post.totalSlots}`}
              </p>
              <p className="font-mono text-sm tabular-nums text-faint">
                {elapsedMs !== null && (
                  <>
                    <span>{formatSpeedrunTime(elapsedMs)}</span>
                    <span className="mx-2 text-faint/50">·</span>
                  </>
                )}
                <span>{formatPts(post.totalScore)}</span>
              </p>
            </div>

            <ol className="mt-4 flex flex-wrap gap-0.5">
              {post.slotStatuses.map((status, i) => {
                const thumb = post.slotThumbs?.[i] ?? null;
                const title = post.slotTitles?.[i] ?? `Slot ${i + 1}`;
                return (
                  <li
                    key={i}
                    title={`${i + 1}. ${title} — ${status}`}
                    className={`relative h-10 w-10 overflow-hidden bg-white/5 ${
                      status === "Pending" ? "opacity-40" : ""
                    } ${status === "Lost" ? "opacity-80" : ""}`}
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
                      <span className="flex h-full items-center justify-center font-mono text-[11px] text-faint">
                        {i + 1}
                      </span>
                    )}
                    {status === "Lost" && (
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-red-950/45"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
            <FeedSplits post={post} />
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

function formatPts(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

/** Frozen timer, or the last recorded split when the overlay clock was never stored. */
function feedElapsedMs(post: FeedPost): number | null {
  if (post.elapsedMs > 0) return post.elapsedMs;
  const splits = (post.slotSplitTimes ?? []).filter(
    (t): t is number => t != null && t > 0,
  );
  return splits.length > 0 ? Math.max(...splits) : null;
}

function FeedSplits({ post }: { post: FeedPost }) {
  const splits = post.slotSplitTimes ?? [];
  const titles = post.slotTitles ?? [];
  const statuses = post.slotStatuses ?? [];
  const hasAny = splits.some((t) => t != null);
  if (!hasAny) return null;

  return (
    <table className="mt-4 w-full border-collapse text-[13px]">
      <caption className="sr-only">Splits</caption>
      <tbody>
        {titles.map((title, i) => {
          const time = splits[i];
          const status = statuses[i];
          if (status === "Pending" && time == null) return null;
          return (
            <tr
              key={i}
              className="border-t border-gold/15 text-faint first:border-t-0"
            >
              <td className="w-6 py-1.5 pr-3 font-mono tabular-nums text-faint">
                {i + 1}
              </td>
              <td
                className={`max-w-0 truncate py-1.5 pr-3 ${
                  status === "Lost" ? "text-red-400/80" : "text-muted"
                }`}
              >
                {title}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums text-faint">
                {time != null ? formatSpeedrunTime(time) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
    <div className="mt-4">
      <ReactionBar
        post={post}
        currentUserId={currentUserId}
        commentsOpen={showComments}
        onToggleComments={() => setShowComments((v) => !v)}
        onPatch={onPatch}
        compact
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

function TopBoards() {
  const [standard, setStandard] = useState<LeaderboardEntry[] | null>(null);
  const [lite, setLite] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLeaderboard("Standard", 5),
      getLeaderboard("Lite", 5),
    ]).then(([s, l]) => {
      if (cancelled) return;
      setStandard(s);
      setLite(l);
    }).catch(() => {
      if (cancelled) return;
      setStandard([]);
      setLite([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (standard === null || lite === null) return null;
  if (standard.length === 0 && lite.length === 0) return null;

  return (
    <section className="mt-8 grid gap-8 sm:grid-cols-2">
      <TopColumn title="Top Standard" runType="Standard" entries={standard} />
      <TopColumn title="Top Lite" runType="Lite" entries={lite} />
    </section>
  );
}

function TopColumn({
  title,
  runType,
  entries,
}: {
  title: string;
  runType: RunType;
  entries: LeaderboardEntry[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        <Link
          href="/leaderboard"
          className="text-sm text-faint hover:text-gold"
        >
          Full board
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-faint">No Clears yet.</p>
      ) : (
        <ol className="feed-list">
          {entries.map((entry) => (
            <li key={entry.runId} className="feed-row flex items-baseline gap-3 py-2.5 text-sm">
              <span className="w-6 shrink-0 font-mono tabular-nums text-gold">
                {entry.rank}
              </span>
              <Link
                href={`/u/${encodeURIComponent(entry.streamerName)}`}
                className="min-w-0 flex-1 truncate text-ink hover:text-gold"
              >
                {entry.streamerName}
              </Link>
              <Link
                href={`/run/${entry.runId}`}
                className="shrink-0 font-mono tabular-nums text-faint"
              >
                {formatPts(entry.totalScore)}
              </Link>
            </li>
          ))}
        </ol>
      )}
      <span className="sr-only">{runType}</span>
    </div>
  );
}
