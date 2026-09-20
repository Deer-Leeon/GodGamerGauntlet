"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommentThread,
  ReactionBar,
  VoteColumn,
  timeAgo,
} from "@/components/RunSocial";
import SpeedrunTimer, {
  formatSpeedrunTime,
} from "@/components/SpeedrunTimer";
import {
  getFeed,
  getGames,
  getLeaderboard,
  getLiveRuns,
  getProfile,
  type FeedPost,
  type FeedSort,
  type Game,
  type LeaderboardEntry,
  type LiveRunCard,
  type ProfileLiveRun,
  type RunType,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import HomeWelcome from "@/components/HomeWelcome";
import RosterGrid from "@/components/RosterGrid";
import MomentChips from "@/components/MomentChips";
import { RunTypeBadge } from "@/components/RunTypeBadge";
import { GAUNTLET_MODES } from "@/lib/site";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "hot", label: "Hot" },
  { id: "new", label: "New" },
  { id: "top", label: "Top" },
];

/**
 * Auth-aware landing banner above the feed: signed-out visitors get the
 * pitch, signed-in players get their gauntlet status (resume or start).
 * Parent waits for auth before mounting this so the pitch cannot flash
 * and then vanish for a signed-in player.
 */
function HomeHero({
  user,
  live,
}: {
  user: User | null;
  live: ProfileLiveRun | null;
}) {
  if (!user) {
    return <HomeWelcome />;
  }

  if (live) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 border border-gold/25 bg-gold/5 px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-gold">
            Gauntlet in progress
          </p>
          <p className="mt-1.5 truncate text-sm text-muted">
            {live.slotsCompleted}/{live.totalSlots} beaten
            {live.currentTitle && (
              <>
                {" · now playing "}
                <span className="text-ink">{live.currentTitle}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          <Link
            href={`/run/${live.runId}`}
            className="bg-gold px-5 py-2.5 text-dark transition hover:bg-gold/90"
          >
            Resume gauntlet
          </Link>
          <Link
            href={`/control/${live.runId}`}
            className="border border-gold/30 px-5 py-2.5 text-muted transition hover:border-gold hover:text-ink"
          >
            Open control deck
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 border border-gold/25 bg-gold/5 px-6 py-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-gold">
          No gauntlet in flight
        </p>
        <p className="mt-1.5 text-sm text-muted">
          Draft a lineup and put a run on the board.
        </p>
      </div>
      <Link
        href="/draft"
        className="shrink-0 bg-gold px-6 py-3 text-sm font-medium text-dark transition hover:bg-gold/90"
      >
        Start a new gauntlet
      </Link>
    </section>
  );
}

const LIVE_POLL_MS = 60_000;

/**
 * Horizontal rail of gauntlets whose timer is running right now. Each card
 * sends viewers to the runner's stream (or profile when no stream is set).
 */
function LiveNowRail({
  initial,
  initialSyncedAt,
}: {
  initial: LiveRunCard[];
  initialSyncedAt: number;
}) {
  const [cards, setCards] = useState(initial);
  // performance.now() at fetch time; SpeedrunTimer extrapolates from here.
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLiveRuns()
        .then((fetched) => {
          if (cancelled) return;
          setCards(fetched);
          setSyncedAt(performance.now());
        })
        .catch(() => {
          // The rail is decoration; a failed poll just keeps the last state.
        });
    const timer = window.setInterval(load, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (cards.length === 0) {
    return (
      <section className="mt-8 border border-gold/20 px-5 py-4 text-sm leading-relaxed text-muted">
        No one live right now.{" "}
        <Link href="/leaderboard" className="text-gold hover:underline">
          Browse Clears
        </Link>
        {" or "}
        <Link href="/draft" className="text-gold hover:underline">
          draft a Sprint
        </Link>
        .
      </section>
    );
  }

  return (
    <section className="mt-8" aria-label="Live now">
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
        <span aria-hidden className="live-run-dot" />
        <span className="text-red-400">LIVE NOW</span>
        <span className="font-normal text-faint">
          {cards.length} gauntlet{cards.length === 1 ? "" : "s"} running
        </span>
      </h2>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {cards.map((card) => (
          <LiveCard key={card.runId} card={card} syncedAt={syncedAt} />
        ))}
      </div>
    </section>
  );
}

function LiveCard({ card, syncedAt }: { card: LiveRunCard; syncedAt: number }) {
  const external = card.streamUrl !== null;
  const href = card.streamUrl ?? `/u/${encodeURIComponent(card.username)}`;

  const body = (
    <>
      {/* Current game cover as the card backdrop. */}
      <div className="relative h-24 w-full overflow-hidden bg-white/5">
        {card.currentThumb ? (
          <Image
            src={card.currentThumb}
            alt=""
            fill
            unoptimized
            sizes="256px"
            className="object-cover opacity-80 transition group-hover:opacity-100"
          />
        ) : (
          <span className="flex h-full items-center justify-center font-mono text-2xl text-faint">
            {(card.currentTitle ?? card.username).slice(0, 1)}
          </span>
        )}
        <span className="absolute left-2 top-2 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-400">
          <span aria-hidden className="live-run-dot" />
          Live
        </span>
      </div>
      <div className="flex items-center gap-2.5 px-3 pt-2.5">
        {card.avatarUrl ? (
          // Free-form external URL — next/image would need domain allowlisting.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.avatarUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded-full border border-gold/25 object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-white/5 font-mono text-xs text-faint">
            {card.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="truncate text-sm font-medium text-ink">
          {card.username}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 px-3 pb-3 pt-1.5">
        <span className="min-w-0 truncate text-xs text-muted">
          {card.currentTitle ?? "Between games"}
          <span className="text-faint">
            {" · "}
            {card.slotsCompleted}/{card.totalSlots}
            {card.runType && card.runType !== "Standard" ? ` · ${card.runType}` : ""}
          </span>
        </span>
        <SpeedrunTimer
          elapsedMs={card.elapsedMs}
          timerStatus="running"
          syncedAt={syncedAt}
          tone="site"
          className="text-sm"
        />
      </div>
    </>
  );

  const cardClass =
    "group w-64 shrink-0 border border-gold/20 bg-surface transition hover:border-gold/45";

  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Watch ${card.username}'s stream`}
      className={cardClass}
    >
      {body}
    </a>
  ) : (
    <Link
      href={href}
      title={`${card.username}'s profile`}
      className={cardClass}
    >
      {body}
    </Link>
  );
}

type HomeBundle = {
  games: Game[];
  liveCards: LiveRunCard[];
  liveSyncedAt: number;
  posts: FeedPost[];
  hasMore: boolean;
  sprint: LeaderboardEntry[];
  marathon: LeaderboardEntry[];
  endurance: LeaderboardEntry[];
};

const FEED_ERROR =
  "Couldn't load the feed. The API may be waking up — try again in a few seconds.";

export default function FeedPage() {
  const { user, loading: authLoading } = useAuth();

  const [bundle, setBundle] = useState<HomeBundle | null>(null);
  const [liveRun, setLiveRun] = useState<ProfileLiveRun | null | undefined>(
    undefined,
  );
  const [sort, setSort] = useState<FeedSort>("hot");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getGames().catch(() => [] as Game[]),
      getLiveRuns().catch(() => [] as LiveRunCard[]),
      getFeed("hot", 1).then(
        (result) => ({ result, error: null as string | null }),
        () => ({ result: null, error: FEED_ERROR }),
      ),
      getLeaderboard("Sprint", 5).catch(() => [] as LeaderboardEntry[]),
      getLeaderboard("Marathon", 5).catch(() => [] as LeaderboardEntry[]),
      getLeaderboard("Endurance", 5).catch(() => [] as LeaderboardEntry[]),
    ]).then(([games, liveCards, feed, sprint, marathon, endurance]) => {
      if (cancelled) return;
      const posts = feed.result?.posts ?? [];
      setBundle({
        games,
        liveCards,
        liveSyncedAt: performance.now(),
        posts,
        hasMore: feed.result?.hasMore ?? false,
        sprint,
        marathon,
        endurance,
      });
      setPosts(posts);
      setPage(1);
      setHasMore(feed.result?.hasMore ?? false);
      setError(feed.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLiveRun(null);
      return;
    }
    let cancelled = false;
    getProfile(user.username)
      .then((profile) => {
        if (!cancelled) setLiveRun(profile.live ?? null);
      })
      .catch(() => {
        if (!cancelled) setLiveRun(null);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const appliedSort = useRef<FeedSort | null>(null);

  const changeSort = useCallback((nextSort: FeedSort) => {
    setSort(nextSort);
  }, []);

  useEffect(() => {
    if (!bundle) return;
    if (appliedSort.current === sort) return;
    if (appliedSort.current === null && sort === "hot") {
      appliedSort.current = "hot";
      return;
    }
    let cancelled = false;
    getFeed(sort, 1)
      .then((result) => {
        if (cancelled) return;
        appliedSort.current = sort;
        setPosts(result.posts);
        setPage(1);
        setHasMore(result.hasMore);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(FEED_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, bundle]);

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

  const ready = Boolean(bundle) && !authLoading && liveRun !== undefined;

  if (!ready || !bundle) {
    return (
      <main
        className="feed-page site-content min-h-[70vh] flex-1 px-5 py-8 sm:px-7"
        aria-busy="true"
      >
        <span className="sr-only">Loading the homepage</span>
      </main>
    );
  }

  return (
    <main className="feed-page site-content flex-1 px-5 py-8 sm:px-7">
      <HomeHero user={user} live={liveRun ?? null} />

      <section className="mt-8" aria-labelledby="home-roster-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-roster-heading" className="text-sm font-medium text-ink">
            The 19 games
          </h2>
          <Link href="/records" className="text-sm text-faint hover:text-gold">
            Game boards
          </Link>
        </div>
        <RosterGrid games={bundle.games} />
      </section>

      <LiveNowRail
        initial={bundle.liveCards}
        initialSyncedAt={bundle.liveSyncedAt}
      />

      <header className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          {user ? (
            <h1 className="text-2xl font-semibold text-ink">Feed</h1>
          ) : (
            <h2 className="text-2xl font-semibold text-ink">Feed</h2>
          )}
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

      <TopBoards
        sprint={bundle.sprint}
        marathon={bundle.marathon}
        endurance={bundle.endurance}
      />

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

      <div className="feed-list mt-5">
        {error && (
          <p className="py-12 text-sm text-red-400/90">{error}</p>
        )}

        {!error && posts.length === 0 && <EmptyFeedWalkthrough />}

        {posts.map((post) => (
          <PostCard
            key={post.runId}
            post={post}
            currentUserId={user?.id ?? null}
            onPatch={(patch) => patchPost(post.runId, patch)}
          />
        ))}
      </div>

      {hasMore && (
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

function EmptyFeedWalkthrough() {
  return (
    <div className="border border-gold/20 px-5 py-8">
      <p className="text-xs uppercase tracking-[0.18em] text-gold">
        Example Clear
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        A finished Marathon looks like this: five games beaten, clock frozen,
        posted to the feed and the boards. Nobody has posted one yet — that
        can be you.
      </p>
      <ol className="mt-5 flex flex-wrap gap-0.5" aria-hidden>
        {["1", "2", "3", "4", "5"].map((n) => (
          <li
            key={n}
            className="flex h-10 w-10 items-center justify-center bg-gold/15 font-mono text-[11px] text-gold"
          >
            {n}
          </li>
        ))}
      </ol>
      <p className="mt-5 flex flex-wrap gap-4 text-sm">
        <Link href="/how" className="text-gold hover:underline">
          How it works
        </Link>
        <Link href="/draft" className="text-gold hover:underline">
          Draft a Sprint
        </Link>
      </p>
    </div>
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
            <RunTypeBadge runType={post.runType} />
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

function TopBoards({
  sprint,
  marathon,
  endurance,
}: {
  sprint: LeaderboardEntry[];
  marathon: LeaderboardEntry[];
  endurance: LeaderboardEntry[];
}) {
  return (
    <section className="mt-8 grid gap-8 sm:grid-cols-3">
      <TopColumn title="Top Sprint" runType="Sprint" entries={sprint} />
      <TopColumn title="Top Marathon" runType="Marathon" entries={marathon} />
      <TopColumn title="Top Endurance" runType="Endurance" entries={endurance} />
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
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <Link
          href="/leaderboard"
          className="text-sm text-faint hover:text-gold"
        >
          Full board
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm leading-relaxed text-faint">
          No Clears yet.{" "}
          {GAUNTLET_MODES.find((mode) => mode.id === runType)?.games ?? 5}{" "}
          games.{" "}
          <Link href="/how" className="text-gold hover:underline">
            How it works
          </Link>
        </p>
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
