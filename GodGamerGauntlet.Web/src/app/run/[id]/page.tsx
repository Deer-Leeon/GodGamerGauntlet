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
  type RunStatus,
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

const STATUS_STYLES: Record<RunStatus, string> = {
  Active: "border-accent-win/60 text-accent-win",
  Failed: "border-accent-death/60 text-accent-death",
  Completed: "border-accent-streak/60 text-accent-streak",
};

function GameThumb({ slot }: { slot: RunSlot }) {
  if (!slot.thumb) {
    return (
      <span
        aria-hidden
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 font-heading text-lg font-bold text-gray-600"
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
      className="h-12 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
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
        <div className="panel h-24 animate-pulse rounded-2xl" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: RUN_TYPE_SLOTS.Standard }).map((_, i) => (
            <div key={i} className="panel h-16 animate-pulse rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  if (loadError || !run) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="font-heading text-3xl font-bold text-accent-death">
          Run not found
        </h1>
        <p className="text-sm text-gray-400">{loadError}</p>
        <Link
          href="/"
          className="rounded-xl bg-accent-streak px-8 py-3 font-heading font-bold text-dark transition hover:brightness-110"
        >
          Back to the Feed
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
        className="mb-4 inline-block text-sm text-gray-500 transition hover:text-accent-win"
      >
        ← Back to feed
      </Link>

      {/* Header */}
      <header className="panel mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface/90 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">
            {isOver ? "Gauntlet lineup" : "Live Run Tracker"}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">
              {run.streamerName}
            </h1>
            <RunTypeBadge runType={run.runType} />
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">
            {wonCount}/{run.totalSlots} cleared · Started{" "}
            {formatWhen(run.startTime)}
            {run.endTime ? ` · Finished ${formatWhen(run.endTime)}` : ""}
            {duration ? ` · ${duration}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => pinControlRun(run.id)}
                className="rounded-lg border border-accent-win/50 px-3 py-1.5 text-xs font-semibold text-accent-win transition hover:bg-accent-win/10"
              >
                Show live controls
              </button>
              <Link
                href={`/control/${run.id}`}
                className="rounded-lg border border-accent-streak/50 px-3 py-1.5 text-xs font-semibold text-accent-streak transition hover:bg-accent-streak/10"
              >
                Control room
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-accent-win/50 hover:text-accent-win"
          >
            {copied ? "Copied" : "Share"}
          </button>
          <span
            className={`rounded-lg border px-3 py-1 font-mono text-sm font-bold uppercase tracking-widest ${STATUS_STYLES[run.status]}`}
          >
            {run.status}
          </span>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-gray-400">
              {isOver ? "Earned" : "Projected total"}
            </p>
            <p className="font-mono text-3xl font-bold text-accent-streak">
              {formatScore(isOver ? earnedScore : run.totalDifficultyScore)}
            </p>
            {runElapsedMs !== null && (
              <p className="font-mono text-sm font-bold text-accent-win">
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
        <div className="panel mb-6 rounded-xl border-accent-death/40 p-4 text-sm text-accent-death">
          {reportError}
        </div>
      )}

      {/* The Gauntlet Board */}
      <ol className="space-y-2">
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
                className="panel flex items-center gap-4 rounded-xl border-accent-win/30 px-4 py-3"
              >
                <span className="font-mono text-lg font-bold text-gray-500">
                  {String(slot.position).padStart(2, "0")}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-semibold text-accent-win">
                    {title}
                  </p>
                  <p className="font-mono text-xs text-gray-400">
                    {base} × {multiplier.toFixed(1)} = +{formatScore(score)} earned
                  </p>
                </div>
                {slot.splitTimeMs != null && (
                  <span className="shrink-0 font-mono text-sm font-bold text-[#00ff66]">
                    {formatSpeedrunTime(slot.splitTimeMs)}
                  </span>
                )}
                <span
                  className="rounded-full border border-accent-win/50 px-2.5 py-0.5 font-mono text-sm font-bold text-accent-win"
                  aria-label="Won"
                >
                  ✓
                </span>
              </li>
            );
          }

          if (slot.status === "Lost") {
            return (
              <li
                key={slot.id}
                className="panel flex items-center gap-4 rounded-xl border-accent-death/60 bg-accent-death/5 px-4 py-3"
              >
                <span className="font-mono text-lg font-bold text-accent-death">
                  {String(slot.position).padStart(2, "0")}
                </span>
                <GameThumb slot={slot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading font-semibold text-accent-death">
                    {title}
                  </p>
                  <p className="font-mono text-xs text-accent-death/80">
                    Run ended here — {formatScore(score)} at stake
                  </p>
                </div>
                <span
                  className="font-mono text-xl"
                  role="img"
                  aria-label="Failed"
                >
                  💀
                </span>
              </li>
            );
          }

          if (isActive) {
            return (
              <li
                key={slot.id}
                className="panel rounded-xl border-accent-win/70 px-4 py-4 shadow-[0_0_24px_rgba(0,229,255,0.25)]"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-lg font-bold text-accent-win">
                    {String(slot.position).padStart(2, "0")}
                  </span>
                  <GameThumb slot={slot} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-lg font-bold">
                      {title}
                    </p>
                    <p className="font-mono text-xs text-gray-400">
                      difficulty {base} × {multiplier.toFixed(1)} ={" "}
                      <span className="text-accent-win">
                        {formatScore(score)}
                      </span>
                    </p>
                  </div>
                </div>
                {isOwner ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Won")}
                      disabled={reporting}
                      className="rounded-xl bg-accent-win py-3 font-heading font-bold text-dark transition enabled:hover:brightness-110 disabled:opacity-50"
                    >
                      {reporting ? "…" : "RECORD WIN"}
                    </button>
                    <button
                      type="button"
                      onClick={() => report(slot.position, "Lost")}
                      disabled={reporting}
                      className="rounded-xl bg-accent-death py-3 font-heading font-bold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
                    >
                      {reporting ? "…" : "RECORD LOSS"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-white/5 px-4 py-3 text-center font-mono text-xs text-gray-400">
                    Spectating — only {run.streamerName} can record results.
                  </p>
                )}
              </li>
            );
          }

          return (
            <li
              key={slot.id}
              className={`panel flex items-center gap-4 rounded-xl px-4 py-3 ${
                isFuture ? "opacity-40" : ""
              }`}
            >
              <span className="font-mono text-lg font-bold text-gray-600">
                {String(slot.position).padStart(2, "0")}
              </span>
              <GameThumb slot={slot} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-heading font-semibold text-gray-400">
                  {title}
                </p>
                <p className="font-mono text-xs text-gray-600">
                  {formatScore(score)} at stake
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {isOver && post && (
        <section className="panel mt-8 flex gap-4 rounded-2xl p-5">
          <VoteColumn
            post={post}
            signedIn={!!user}
            onPatch={(patch) => setPost((current) => (current ? { ...current, ...patch } : current))}
          />
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-xs uppercase tracking-widest text-gray-500">
              Community
            </p>
            <ReactionBar
              post={post}
              currentUserId={user?.id ?? null}
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

      {/* End-of-run navigation */}
      {isOver && (
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="font-heading text-xl font-bold">
            {run.status === "Completed"
              ? "Gauntlet conquered. God Gamer confirmed."
              : "The gauntlet claims another."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/draft"
              className="rounded-xl bg-accent-streak px-8 py-3 font-heading font-bold text-dark transition hover:brightness-110"
            >
              Start a New Run
            </Link>
            <Link
              href="/leaderboard"
              className="rounded-xl border border-accent-win/50 px-8 py-3 font-heading font-bold text-accent-win transition hover:bg-accent-win/10"
            >
              View Leaderboard
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
