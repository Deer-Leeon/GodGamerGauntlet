"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getLeaderboard,
  RUN_TYPE_SLOTS,
  type LeaderboardEntry,
  type RunType,
} from "@/lib/api";

const BOARDS: { id: RunType; label: string }[] = [
  { id: "Standard", label: `Standard (${RUN_TYPE_SLOTS.Standard} games)` },
  { id: "Lite", label: `Lite (${RUN_TYPE_SLOTS.Lite} games)` },
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
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gold/20 pb-5">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted">
            Best Clear per player, ranked by earned score.
          </p>
        </div>
        <Link
          href="/draft"
          className="bg-gold px-3 py-1.5 text-sm text-dark transition hover:bg-gold/90"
        >
          Draft a run
        </Link>
      </header>

      <div
        role="tablist"
        aria-label="Gauntlet mode"
        className="mt-5 flex gap-5 border-b border-gold/20 text-sm"
      >
        {BOARDS.map((board) => (
          <button
            key={board.id}
            role="tab"
            aria-selected={runType === board.id}
            onClick={() => setRunType(board.id)}
            className={`-mb-px border-b-2 pb-2 transition ${
              runType === board.id
                ? "border-gold text-gold"
                : "border-transparent text-muted/70 hover:text-ink"
            }`}
          >
            {board.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p className="py-6 text-sm text-red-400/90">{loadError}</p>
      )}

      <div className="feed-list">
        <div className="grid grid-cols-[3rem_1fr_6rem_5rem_8rem] gap-2 border-b border-gold/20 px-0 py-3 text-[12px] text-muted sm:grid-cols-[3rem_1fr_7rem_6rem_8rem]">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Score</span>
          <span className="text-center">Slots</span>
          <span className="hidden text-right sm:block">Finished</span>
        </div>

        {loading && (
          <p className="py-12 text-sm text-muted">Loading…</p>
        )}

        {!loading && !loadError && entries.length === 0 && (
          <p className="py-12 text-sm text-muted">
            No {runType === "Lite" ? "Lite" : "Standard"} Clears yet.
          </p>
        )}

        <ol>
          {entries.map((entry) => (
            <li key={entry.runId} className="feed-row">
              <div className="grid grid-cols-[3rem_1fr_6rem_5rem_8rem] items-center gap-2 py-3 text-sm sm:grid-cols-[3rem_1fr_7rem_6rem_8rem]">
                <Link
                  href={`/run/${entry.runId}`}
                  className="font-mono tabular-nums text-gold"
                >
                  {entry.rank}
                </Link>
                <Link
                  href={`/u/${encodeURIComponent(entry.streamerName)}`}
                  className="truncate font-medium text-ink hover:text-gold"
                >
                  {entry.streamerName}
                </Link>
                <Link
                  href={`/run/${entry.runId}`}
                  className="text-right font-mono tabular-nums text-gold"
                >
                  {formatScore(entry.totalScore)}
                </Link>
                <Link
                  href={`/run/${entry.runId}`}
                  className="text-center font-mono text-sm tabular-nums text-muted"
                >
                  {entry.slotsCompleted}/{entry.totalSlots}
                </Link>
                <Link
                  href={`/run/${entry.runId}`}
                  className="hidden text-right font-mono text-xs text-muted sm:block"
                >
                  {formatDate(entry.endTime)}
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
