"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getLeaderboard,
  RUN_TYPE_SLOTS,
  type LeaderboardEntry,
  type RunType,
} from "@/lib/api";

const MEDAL_COLORS: Record<number, string> = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

const BOARDS: { id: RunType; label: string }[] = [
  { id: "Standard", label: `Standard (${RUN_TYPE_SLOTS.Standard} Games)` },
  { id: "Lite", label: `Lite (${RUN_TYPE_SLOTS.Lite} Games)` },
];

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeaderboardPage() {
  const [runType, setRunType] = useState<RunType>("Standard");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    getLeaderboard(runType)
      .then((fetched) => {
        if (!cancelled) setEntries(fetched);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load the leaderboard.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [runType]);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.4em] text-accent-streak">
            Hall of the Fallen &amp; the Crowned
          </p>
          <h1 className="font-heading text-4xl font-bold sm:text-5xl">
            GLOBAL LEADERBOARD
          </h1>
        </div>
        <Link
          href="/draft"
          className="rounded-xl bg-accent-streak px-6 py-3 font-heading font-bold text-dark transition hover:brightness-110"
        >
          Draft a New Run
        </Link>
      </header>

      {/* Standard and Lite runs are ranked on separate boards. */}
      <div
        role="tablist"
        aria-label="Gauntlet mode"
        className="mb-6 flex items-center gap-2"
      >
        {BOARDS.map((board) => (
          <button
            key={board.id}
            role="tab"
            aria-selected={runType === board.id}
            onClick={() => setRunType(board.id)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              runType === board.id
                ? "bg-accent-win/15 text-accent-win"
                : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {board.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="panel mb-6 rounded-xl border-accent-death/40 p-4 text-sm text-accent-death">
          {loadError}
        </div>
      )}

      {/* Board */}
      <div className="panel overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[3rem_1fr_6rem_6rem_7rem] gap-2 border-b border-white/10 bg-surface px-4 py-3 text-xs uppercase tracking-widest text-gray-400 sm:grid-cols-[3rem_1fr_7rem_7rem_7rem_9rem]">
          <span>Rank</span>
          <span>Streamer</span>
          <span className="text-right">Score</span>
          <span className="text-center">Slots</span>
          <span className="text-center">Status</span>
          <span className="hidden text-right sm:block">Finished</span>
        </div>

        {loading && (
          <ul>
            {Array.from({ length: 8 }).map((_, i) => (
              <li
                key={i}
                className="h-14 animate-pulse border-b border-white/5 bg-white/[0.02]"
              />
            ))}
          </ul>
        )}

        {!loading && !loadError && entries.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500">
            No finished{" "}
            {runType === "Lite" ? "Gauntlet Lite" : "Standard"} runs yet. Be the
            first to survive it.
          </p>
        )}

        <ol>
          {entries.map((entry, index) => {
            const rank = index + 1;
            const medal = MEDAL_COLORS[rank];
            const completed = entry.status === "Completed";
            return (
              <li
                key={entry.runId}
                className="border-b border-white/5 last:border-b-0"
              >
                <Link
                  href={`/run/${entry.runId}`}
                  className="grid grid-cols-[3rem_1fr_6rem_6rem_7rem] items-center gap-2 px-4 py-3 transition hover:bg-white/[0.04] sm:grid-cols-[3rem_1fr_7rem_7rem_7rem_9rem]"
                >
                <span
                  className="font-mono text-lg font-bold"
                  style={medal ? { color: medal } : undefined}
                >
                  {medal ? `#${rank}` : rank}
                </span>
                <span
                  className={`truncate font-heading font-semibold ${medal ? "" : "text-gray-200"}`}
                  style={medal ? { color: medal } : undefined}
                >
                  {entry.streamerName}
                </span>
                <span className="text-right font-mono font-bold text-accent-streak">
                  {formatScore(entry.totalScore)}
                </span>
                <span className="text-center font-mono text-sm text-gray-300">
                  {entry.slotsCompleted}/{entry.totalSlots}
                </span>
                <span className="flex justify-center">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider ${
                      completed
                        ? "border-accent-streak/60 text-accent-streak"
                        : "border-accent-death/60 text-accent-death"
                    }`}
                  >
                    {completed ? "Completed" : "Failed"}
                  </span>
                </span>
                <span className="hidden text-right font-mono text-xs text-gray-500 sm:block">
                  {formatDate(entry.endTime)}
                </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </main>
  );
}
