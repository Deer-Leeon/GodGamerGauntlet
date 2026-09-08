"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getFeedPost,
  getPlacement,
  getRun,
  reportSlotMatch,
  RUN_TYPE_SLOTS,
  type FeedPost,
  type Run,
  type RunPlacement,
  type RunSlot,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pinControlRun } from "@/lib/controlSession";
import { StreamLinkList } from "@/components/StreamLinks";
import {
  CommentThread,
  ReactionBar,
  VoteColumn,
} from "@/components/RunSocial";
import { RunTypeBadge } from "@/components/RunTypeBadge";
import AttemptCodeMark from "@/components/AttemptCodeMark";
import SpeedrunTimer, { formatSpeedrunTime } from "@/components/SpeedrunTimer";
import MomentChips from "@/components/MomentChips";
import { useOverlayRun } from "@/lib/useOverlayRun";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatDelta(pts: number): string {
  const abs = Math.abs(pts).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  if (pts === 0) return "tied with 1st";
  return pts < 0 ? `−${abs} vs 1st` : `+${abs} vs 1st`;
}

function formatDuration(startIso: string, endIso: string | null): string | null {
  if (!endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0 && minutes === 0) return "under a minute";
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function GameThumb({ slot }: { slot: RunSlot }) {
  if (!slot.thumb) {
    return (
      <span
        aria-hidden
        className="flex h-12 w-16 shrink-0 items-center justify-center bg-white/5 text-lg font-semibold text-faint"
      >
        {slot.title.charAt(0)}
      </span>
    );
  }
  return (
    <Image
      src={slot.thumb}
      alt=""
      width={64}
      height={48}
      unoptimized
      className="h-12 w-16 shrink-0 object-cover"
    />
  );
}

export default function LiveRunTrackerPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [run, setRun] = useState<Run | null>(null);
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [placement, setPlacement] = useState<RunPlacement | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRun(id)
      .then(async (fetchedRun) => {
        if (cancelled) return;
        setRun(fetchedRun);
        try {
          const feedPost = await getFeedPost(fetchedRun.id);
          if (!cancelled) setPost(feedPost);
        } catch {
          if (!cancelled) setPost(null);
        }
        if (fetchedRun.status !== "Active") {
          try {
            const place = await getPlacement(fetchedRun.id);
            if (!cancelled) setPlacement(place);
          } catch {
            if (!cancelled) setPlacement(null);
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Run not found.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const orderedSlots = useMemo(
    () => (run ? [...run.slots].sort((a, b) => a.position - b.position) : []),
    [run],
  );

  const earnedScore = useMemo(
    () =>
      orderedSlots
        .filter((s) => s.status === "Won")
        .reduce((sum, s) => sum + s.baseDifficulty, 0),
    [orderedSlots],
  );

  const lineupScore = useMemo(
    () => orderedSlots.reduce((sum, s) => sum + s.baseDifficulty, 0),
    [orderedSlots],
  );

  const wonCount = orderedSlots.filter((s) => s.status === "Won").length;

  // The active slot is the first Pending one — but only while the run is Active.
  const activePosition =
    run?.status === "Active"
      ? (orderedSlots.find((s) => s.status === "Pending")?.position ?? null)
      : null;

  const overlay = useOverlayRun(run?.status === "Active" ? id : "");
  const overlayBySlot = useMemo(() => {
    const map = new Map<
      number,
      { completed: boolean; splitTimeMs: number | null; status?: string }
    >();
    for (const game of overlay.state?.games ?? []) {
      map.set(game.slotNumber, {
        completed: game.completed,
        splitTimeMs: game.splitTimeMs,
        status: game.status,
      });
    }
    return map;
  }, [overlay.state]);
  // Splits are the cumulative gauntlet clock; a slot's own speedrun time is
  // the gap to the previous recorded split. Feeds the records-submit prefill.
  const segmentBySlot = useMemo(() => {
    const segments = new Map<number, number>();
    let previous = 0;
    for (const slot of orderedSlots) {
      const split =
        overlayBySlot.get(slot.position)?.splitTimeMs ?? slot.splitTimeMs;
      if (split == null) continue;
      if (split > previous) segments.set(slot.position, split - previous);
      previous = Math.max(previous, split);
    }
    return segments;
  }, [orderedSlots, overlayBySlot]);
  const liveActivePosition =
    overlay.state && run?.status === "Active"
      ? overlay.state.currentSlotIndex + 1
      : activePosition;

  async function report(position: number, result: "Won" | "Lost") {
    if (!run || reporting) return;
    setReporting(true);
    setReportError(null);
    try {
      const updated = await reportSlotMatch(run.id, position, result);
      setRun(updated);
    } catch (error: unknown) {
      setReportError(
        error instanceof Error ? error.message : "Failed to report match.",
      );
    } finally {
      setReporting(false);
    }
  }

  if (loading) {
    return (
      <main className="site-content flex-1 px-6 py-10">
        <div className="h-24 animate-pulse border-b border-white/12" />
        <div className="mt-6 space-y-0">
          {Array.from({ length: RUN_TYPE_SLOTS.Endurance }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse border-b border-white/8" />
          ))}
        </div>
      </main>
    );
  }

  if (loadError || !run) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">
          Run not found
        </h1>
        <p className="text-sm text-faint">{loadError}</p>
        <Link
          href="/"
          className="border border-white/20 px-4 py-2 text-sm text-ink transition hover:bg-white/5"
        >
          Back to the feed
        </Link>
      </main>
    );
  }

  const isOver = run.status === "Failed" || run.status === "Completed";
  // Only the streamer who owns the run can report results.
  const isOwner = user?.id === run.userId;
  const duration = formatDuration(run.startTime, run.endTime);
  const streamerName = run.streamerName;
  const overlayElapsed = overlay.state?.elapsedMs;
  const overlayStatus = overlay.state?.timerStatus;
  const runElapsedMs =
    overlayElapsed != null && overlayElapsed > 0
      ? overlayElapsed
      : run.elapsedMs > 0
        ? run.elapsedMs
        : (orderedSlots
            .map((s) => overlayBySlot.get(s.position)?.splitTimeMs ?? s.splitTimeMs)
            .filter((t): t is number => t != null && t > 0)
            .sort((a, b) => b - a)[0] ?? null);
  const liveTimerStatus = overlayStatus ?? run.timerStatus ?? "idle";
  const showLiveClock = !isOver && (overlay.syncedAt > 0 || liveTimerStatus !== "idle");

  async function copyLink() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${streamerName}'s Gauntlet`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore cancelled share sheets
      }
    }
  }

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <Link
        href="/"
        className="mb-5 inline-block text-sm text-faint transition hover:text-ink"
      >
        ← Back to feed
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          <p className="text-sm text-muted">
            {isOver ? "Lineup" : "Live run"}
          </p>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold">
              <Link
                href={`/u/${encodeURIComponent(run.streamerName)}`}
                className="hover:text-gold"
              >
                {run.streamerName}
              </Link>
            </h1>
            <RunTypeBadge runType={run.runType} />
            <AttemptCodeMark
              code={overlay.state?.attemptCode ?? run.attemptCode}
            />
            <span
              className={
                run.status === "Failed" ? "text-red-400/80" : "text-gold"
              }
            >
              {run.status === "Completed"
                ? "Clear"
                : run.status === "Failed"
                  ? "DNF"
                  : "Live"}
            </span>
          </div>
          <p className="mt-2 text-sm text-faint">
            {wonCount}/{run.totalSlots} cleared · Started {formatWhen(run.startTime)}
            {run.endTime ? ` · Finished ${formatWhen(run.endTime)}` : ""}
            {duration ? ` · ${duration}` : ""}
          </p>
          <StreamLinkList links={run.streamLinks} live={!isOver} />
          {isOver && placement && run.status === "Completed" && (
            <p className="mt-2 text-sm text-muted">
              {placement.isPersonalBest ? (
                <>
                  #{placement.boardRank} of {placement.boardSize} on{" "}
                  {placement.runType}
                  {placement.boardRank !== 1 && placement.leaderScore > 0
                    ? ` · ${formatDelta(earnedScore - placement.leaderScore)}`
                    : null}
                </>
              ) : (
                <>
                  This run would be #{placement.wouldBeRank}
                  {placement.personalBestScore != null ? (
                    <>
                      {" "}
                      · PB still {formatScore(placement.personalBestScore)}
                      {placement.personalBestRank != null
                        ? ` (#${placement.personalBestRank})`
                        : ""}
                    </>
                  ) : null}
                </>
              )}
            </p>
          )}
          {isOver && placement?.nextRank != null && (placement.pointsToNext ?? 0) > 0 && (
            <p className="mt-1 text-sm text-faint">
              {formatScore(placement.pointsToNext ?? 0)} behind #{placement.nextRank}
              {placement.nextUsername ? ` · ${placement.nextUsername}` : ""}
              {run.status === "Completed" && !placement.isPersonalBest
                ? " if this were the PB"
                : ""}
            </p>
          )}
          {isOver && placement?.boardRank === 1 && (
            <p className="mt-1 text-sm text-gold">You hold 1st</p>
          )}
          {isOver && run.status === "Failed" && (
            <p className="mt-1 text-sm text-faint">Clear the lineup to place.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => pinControlRun(run.id)}
                className="border border-gold/30 px-4 py-2 text-sm text-ink transition hover:bg-gold/10"
              >
                Show live controls
              </button>
              <Link
                href={`/control/${run.id}`}
                className="border border-gold/25 px-4 py-2 text-sm text-faint transition hover:text-ink"
              >
                Control room
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="border border-gold/25 px-4 py-2 text-sm text-faint transition hover:text-ink"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <div className="text-right">
            <p className="text-sm text-faint">
              {run.status === "Completed"
                ? "Cleared"
                : run.status === "Failed"
                  ? "Survived"
                  : "Progress"}
            </p>
            <p className="font-mono text-2xl tabular-nums text-gold">
              {wonCount}/{run.totalSlots}
            </p>
            {showLiveClock ? (
              <SpeedrunTimer
                elapsedMs={overlayElapsed ?? run.elapsedMs}
                timerStatus={liveTimerStatus}
                syncedAt={overlay.syncedAt}
                tone="site"
                className="text-xl"
              />
            ) : runElapsedMs !== null ? (
              <p className="font-mono text-sm tabular-nums text-muted">
                {formatSpeedrunTime(runElapsedMs)}
              </p>
            ) : null}
            <p className="mt-1 font-mono text-sm text-faint">
              {formatScore(isOver ? earnedScore : lineupScore)}
              {isOver ? " beaten" : " if cleared"}
            </p>
          </div>
        </div>
      </header>

      {isOver && placement && (
        <section className="mb-8 border border-gold/30 bg-gold/5 px-5 py-6 text-center">
          <p className="text-sm uppercase tracking-[0.18em] text-gold">
            Recap
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            {placement.recapTitle}
          </h2>
          {post && (
            <div className="mt-3 flex justify-center">
              <MomentChips moments={post.moments} />
            </div>
          )}
        </section>
      )}

      {reportError && (
        <p className="mb-6 text-sm text-red-400/90">{reportError}</p>
      )}

      <ol className="feed-list">
        {orderedSlots.map((slot) => {
          const title = slot.title;
          const base = slot.baseDifficulty;
          const overlaySlot = overlayBySlot.get(slot.position);
          const status =
            overlaySlot?.completed
              ? "Won"
              : overlaySlot?.status === "Lost"
                ? "Lost"
                : slot.status;
          const splitTimeMs = overlaySlot?.splitTimeMs ?? slot.splitTimeMs;
          const isActive = slot.position === liveActivePosition;
          const isFuture = status === "Pending" && !isActive;

          if (status === "Won") {
            const segmentMs = segmentBySlot.get(slot.position);
            return (
              <li
                key={slot.id}
                className="feed-row relative flex items-center gap-4 py-4 pl-3"
              >
                <span className="absolute inset-y-0 left-0 w-0.5 bg-gold" />
                <span className="w-6 font-mono text-sm tabular-nums text-gold">
                  {slot.position}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{title}</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
                    +{base}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm tabular-nums text-gold">
                    {splitTimeMs != null
                      ? formatSpeedrunTime(splitTimeMs)
                      : "—"}
                  </span>
                  {isOwner && segmentMs != null && (
                    <Link
                      href={`/records/${slot.gameId}/submit?timeMs=${segmentMs}&sourceRunId=${id}`}
                      className="text-[11px] text-gold/70 transition hover:text-gold"
                    >
                      Add as a time →
                    </Link>
                  )}
                </div>
              </li>
            );
          }

          if (status === "Lost") {
            return (
              <li
                key={slot.id}
                className="feed-row relative flex items-center gap-4 py-5 pl-3"
              >
                <span className="absolute inset-y-0 left-0 w-0.5 bg-red-400/80" />
                <span className="w-6 font-mono text-sm tabular-nums text-red-400/80">
                  {slot.position}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-red-400/80">{title}</p>
                  <p className="mt-0.5 font-mono text-xs text-faint">
                    Run ended here
                  </p>
                </div>
                {splitTimeMs != null && (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-red-400/80">
                    {formatSpeedrunTime(splitTimeMs)}
                  </span>
                )}
              </li>
            );
          }

          if (isActive) {
            return (
              <li key={slot.id} className="feed-row relative py-6 pl-3">
                <span className="absolute inset-y-0 left-0 w-0.5 bg-gold" />
                <p className="mb-3 text-[11px] uppercase tracking-wide text-gold">
                  Now
                </p>
                <div className="flex items-center gap-4">
                  <span className="w-6 font-mono text-sm tabular-nums text-ink">
                    {slot.position}
                  </span>
                  <GameThumb slot={slot} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-faint">
                      {base}
                    </p>
                  </div>
                  {showLiveClock ? (
                    <SpeedrunTimer
                      elapsedMs={overlayElapsed ?? run.elapsedMs}
                      timerStatus={liveTimerStatus}
                      syncedAt={overlay.syncedAt}
                      tone="site"
                      className="shrink-0 text-sm"
                    />
                  ) : (
                    <span className="shrink-0 font-mono text-sm tabular-nums text-faint">
                      —
                    </span>
                  )}
                </div>
                {isOwner ? (
                  <div className="slot-actions">
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Won")}
                      disabled={reporting}
                      className="border border-gold/40 bg-gold py-2.5 text-sm text-dark hover:bg-gold/90 disabled:opacity-50"
                    >
                      {reporting ? "…" : "Record win"}
                    </button>
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Lost")}
                      disabled={reporting}
                      className="border border-gold/25 py-2.5 text-sm text-faint hover:text-red-400/80 disabled:opacity-50"
                    >
                      {reporting ? "…" : "Record loss"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-5 text-center text-sm text-faint">
                    Spectating — only {run.streamerName} can record results.
                  </p>
                )}
              </li>
            );
          }

          return (
            <li
              key={slot.id}
              className={`feed-row flex items-center gap-4 py-4 ${
                isFuture ? "opacity-70" : ""
              }`}
            >
              <span className="w-6 font-mono text-sm tabular-nums text-faint">
                {slot.position}
              </span>
              <GameThumb slot={slot} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-muted">{title}</p>
                <p className="mt-0.5 font-mono text-xs text-faint">{base}</p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-faint">
                —
              </span>
            </li>
          );
        })}
      </ol>

      {post && (
        <section className="mt-10 flex gap-5 border-t border-gold/20 pt-6">
          {isOver && (
            <VoteColumn
              post={post}
              signedIn={!!user}
              compact
              onPatch={(patch) => setPost((current) => (current ? { ...current, ...patch } : current))}
            />
          )}
          <div className="min-w-0 flex-1">
            <ReactionBar
              post={post}
              currentUserId={user?.id ?? null}
              compact
              onPatch={(patch) =>
                setPost((current) => (current ? { ...current, ...patch } : current))
              }
            />
            {isOver && (
              <CommentThread
                runId={run.id}
                currentUserId={user?.id ?? null}
                onCountChange={(count) =>
                  setPost((current) =>
                    current ? { ...current, commentCount: count } : current,
                  )
                }
              />
            )}
          </div>
        </section>
      )}

      {isOver && (
        <div className="mt-10 flex flex-wrap gap-3 border-t border-gold/20 pt-6">
          <Link
            href="/draft"
            className="bg-gold px-4 py-2.5 text-sm text-dark transition hover:bg-gold/90"
          >
            Start a new run
          </Link>
          <Link
            href="/leaderboard"
            className="border border-gold/25 px-4 py-2.5 text-sm text-faint transition hover:text-ink"
          >
            Leaderboard
          </Link>
        </div>
      )}
    </main>
  );
}
