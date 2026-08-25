"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getFeedPost,
  getRun,
  reportSlotMatch,
  RUN_TYPE_SLOTS,
  type FeedPost,
  type Run,
  type RunSlot,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pinControlRun } from "@/lib/controlSession";
import {
  CommentThread,
  ReactionBar,
  VoteColumn,
} from "@/components/RunSocial";
import { RunTypeBadge } from "@/components/RunTypeBadge";
import { formatSpeedrunTime } from "@/components/SpeedrunTimer";

/** Slot score: BaseDifficulty * (1 + 0.1 * (Position - 1)^2) */
function slotScore(baseDifficulty: number, position: number): number {
  return baseDifficulty * (1 + 0.1 * Math.pow(position - 1, 2));
}

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
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
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
        className="flex h-12 w-16 shrink-0 items-center justify-center bg-white/5 text-lg font-semibold text-gray-600"
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

  useEffect(() => {
    let cancelled = false;

    getRun(id)
      .then(async (fetchedRun) => {
        if (cancelled) return;
        setRun(fetchedRun);
        if (fetchedRun.status !== "Active") {
          try {
            const feedPost = await getFeedPost(fetchedRun.id);
            if (!cancelled) setPost(feedPost);
          } catch {
            if (!cancelled) setPost(null);
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
        .reduce((sum, s) => sum + slotScore(s.baseDifficulty, s.position), 0),
    [orderedSlots],
  );

  const wonCount = orderedSlots.filter((s) => s.status === "Won").length;

  // The active slot is the first Pending one — but only while the run is Active.
  const activePosition =
    run?.status === "Active"
      ? (orderedSlots.find((s) => s.status === "Pending")?.position ?? null)
      : null;

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
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="h-24 animate-pulse border-b border-white/12" />
        <div className="mt-6 space-y-0">
          {Array.from({ length: RUN_TYPE_SLOTS.Standard }).map((_, i) => (
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
        <p className="text-sm text-gray-500">{loadError}</p>
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
  const runElapsedMs =
    run.elapsedMs > 0
      ? run.elapsedMs
      : (orderedSlots
          .map((s) => s.splitTimeMs)
          .filter((t): t is number => t != null && t > 0)
          .sort((a, b) => b - a)[0] ?? null);

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-gray-500 transition hover:text-ink"
      >
        ← Back to feed
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/12 pb-5">
        <div>
          <p className="text-sm text-gray-500">
            {isOver ? "Lineup" : "Live run"}
          </p>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-2xl font-semibold">{run.streamerName}</h1>
            <RunTypeBadge runType={run.runType} />
            <span className={run.status === "Failed" ? "text-red-400/80" : "text-gray-500"}>
              {run.status === "Completed"
                ? "Clear"
                : run.status === "Failed"
                  ? "DNF"
                  : "Live"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {wonCount}/{run.totalSlots} cleared · Started {formatWhen(run.startTime)}
            {run.endTime ? ` · Finished ${formatWhen(run.endTime)}` : ""}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => pinControlRun(run.id)}
                className="border border-white/20 px-3 py-1.5 text-xs text-ink transition hover:bg-white/5"
              >
                Show live controls
              </button>
              <Link
                href={`/control/${run.id}`}
                className="border border-white/15 px-3 py-1.5 text-xs text-gray-400 transition hover:text-ink"
              >
                Control room
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="border border-white/15 px-3 py-1.5 text-xs text-gray-400 transition hover:text-ink"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {isOver ? "Earned" : "Projected"}
            </p>
            <p className="font-mono text-2xl tabular-nums text-ink">
              {formatScore(isOver ? earnedScore : run.totalDifficultyScore)}
            </p>
            {runElapsedMs !== null && (
              <p className="font-mono text-sm tabular-nums text-gray-400">
                {formatSpeedrunTime(runElapsedMs)}
              </p>
            )}
            {isOver && (
              <p className="font-mono text-xs text-gray-500">
                {formatScore(run.totalDifficultyScore)} projected
              </p>
            )}
          </div>
        </div>
      </header>

      {reportError && (
        <p className="mb-6 text-sm text-red-400/90">{reportError}</p>
      )}

      <ol className="feed-list">
        {orderedSlots.map((slot) => {
          const title = slot.title;
          const base = slot.baseDifficulty;
          const multiplier = 1 + 0.1 * Math.pow(slot.position - 1, 2);
          const score = slotScore(base, slot.position);
          const isActive = slot.position === activePosition;
          const isFuture = slot.status === "Pending" && !isActive;

          if (slot.status === "Won") {
            return (
              <li
                key={slot.id}
                className="feed-row flex items-center gap-4 py-3"
              >
                <span className="w-6 font-mono text-sm tabular-nums text-gray-500">
                  {slot.position}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{title}</p>
                  <p className="font-mono text-xs tabular-nums text-gray-500">
                    {base} × {multiplier.toFixed(1)} = +{formatScore(score)}
                  </p>
                </div>
                {slot.splitTimeMs != null && (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-gray-400">
                    {formatSpeedrunTime(slot.splitTimeMs)}
                  </span>
                )}
              </li>
            );
          }

          if (slot.status === "Lost") {
            return (
              <li
                key={slot.id}
                className="feed-row flex items-center gap-4 py-3"
              >
                <span className="w-6 font-mono text-sm tabular-nums text-red-400/80">
                  {slot.position}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-red-400/80">{title}</p>
                  <p className="font-mono text-xs text-gray-500">
                    Run ended here — {formatScore(score)} at stake
                  </p>
                </div>
              </li>
            );
          }

          if (isActive) {
            return (
              <li key={slot.id} className="feed-row py-4">
                <div className="flex items-center gap-4">
                  <span className="w-6 font-mono text-sm tabular-nums text-ink">
                    {slot.position}
                  </span>
                  <GameThumb slot={slot} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {title}
                    </p>
                    <p className="font-mono text-xs tabular-nums text-gray-500">
                      {base} × {multiplier.toFixed(1)} = {formatScore(score)}
                    </p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Won")}
                      disabled={reporting}
                      className="border border-white/20 py-2 text-sm text-ink hover:bg-white/5 disabled:opacity-50"
                    >
                      {reporting ? "…" : "Record win"}
                    </button>
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Lost")}
                      disabled={reporting}
                      className="border border-white/15 py-2 text-sm text-gray-400 hover:text-red-400/80 disabled:opacity-50"
                    >
                      {reporting ? "…" : "Record loss"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-center text-xs text-gray-500">
                    Spectating — only {run.streamerName} can record results.
                  </p>
                )}
              </li>
            );
          }

          return (
            <li
              key={slot.id}
              className={`feed-row flex items-center gap-4 py-3 ${
                isFuture ? "opacity-40" : ""
              }`}
            >
              <span className="w-6 font-mono text-sm tabular-nums text-gray-600">
                {slot.position}
              </span>
              <GameThumb slot={slot} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-400">{title}</p>
                <p className="font-mono text-xs text-gray-600">
                  {formatScore(score)} at stake
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {isOver && post && (
        <section className="mt-8 flex gap-4 border-t border-white/12 pt-5">
          <VoteColumn
            post={post}
            signedIn={!!user}
            compact
            onPatch={(patch) => setPost((current) => (current ? { ...current, ...patch } : current))}
          />
          <div className="min-w-0 flex-1">
            <ReactionBar
              post={post}
              currentUserId={user?.id ?? null}
              compact
              onPatch={(patch) =>
                setPost((current) => (current ? { ...current, ...patch } : current))
              }
            />
            <CommentThread
              runId={run.id}
              currentUserId={user?.id ?? null}
              onCountChange={(count) =>
                setPost((current) =>
                  current ? { ...current, commentCount: count } : current,
                )
              }
            />
          </div>
        </section>
      )}

      {isOver && (
        <div className="mt-8 flex flex-wrap gap-3 border-t border-white/12 pt-5">
          <Link
            href="/draft"
            className="border border-white/20 px-4 py-2 text-sm text-ink transition hover:bg-white/5"
          >
            Start a new run
          </Link>
          <Link
            href="/leaderboard"
            className="border border-white/15 px-4 py-2 text-sm text-gray-400 transition hover:text-ink"
          >
            Leaderboard
          </Link>
        </div>
      )}
    </main>
  );
}
