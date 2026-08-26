"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getHallOfFame,
  getLeaderboard,
  getSurvivalBoard,
  RUN_TYPE_SLOTS,
  type LeaderboardEntry,
  type RunType,
  type SeasonChampion,
} from "@/lib/api";

const MODES: { id: RunType; label: string }[] = [
  { id: "Standard", label: `Standard (${RUN_TYPE_SLOTS.Standard} games)` },
  { id: "Lite", label: `Lite (${RUN_TYPE_SLOTS.Lite} games)` },
];

type View = "all" | "current" | "survival" | "seasons";

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All-time" },
  { id: "current", label: "This month" },
  { id: "survival", label: "Furthest DNF" },
  { id: "seasons", label: "Hall of fame" },
];

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
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
  const [view, setView] = useState<View>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [seasons, setSeasons] = useState<SeasonChampion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const request =
      view === "seasons"
        ? getHallOfFame().then((fetched) => {
            if (!cancelled) {
              setSeasons(fetched);
              setEntries([]);
            }
          })
        : (view === "survival"
            ? getSurvivalBoard(runType)
            : getLeaderboard(runType, 50, view)
          ).then((fetched) => {
            if (!cancelled) {
              setEntries(fetched);
              setSeasons([]);
            }
          });

    request
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
  }, [runType, view]);

  const blurb =
    view === "survival"
      ? "Deepest DNF per player. How far they walked before the lineup ended them."
      : view === "current"
        ? "Best Clear this month. Harder lineups rank higher."
        : view === "seasons"
          ? "Monthly #1s. All-time PBs still live on profiles."
          : "Best Clear per player. Harder lineups rank higher.";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{blurb}</p>
        </div>
        <Link
          href="/draft"
          className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Draft a run
        </Link>
      </header>

      <div
        role="tablist"
        aria-label="Board"
        className="mt-8 flex flex-wrap gap-6 border-b border-gold/20 text-sm"
      >
        {VIEWS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={view === item.id}
            onClick={() => setView(item.id)}
            className={`-mb-px border-b-2 pb-3 transition ${
              view === item.id
                ? "border-gold text-gold"
                : "border-transparent text-faint hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view !== "seasons" && (
        <div
          role="tablist"
          aria-label="Gauntlet mode"
          className="mt-6 flex gap-6 border-b border-gold/20 text-sm"
        >
          {MODES.map((board) => (
            <button
              key={board.id}
              role="tab"
              aria-selected={runType === board.id}
              onClick={() => setRunType(board.id)}
              className={`-mb-px border-b-2 pb-3 transition ${
                runType === board.id
                  ? "border-gold text-gold"
                  : "border-transparent text-faint hover:text-ink"
              }`}
            >
              {board.label}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <p className="py-6 text-sm text-red-400/90">{loadError}</p>
      )}

      {view === "seasons" ? (
        <HallOfFame loading={loading} seasons={seasons} />
      ) : (
        <BoardTable
          loading={loading}
          loadError={loadError}
          entries={entries}
          empty={
            view === "survival"
              ? `No ${runType} DNFs yet.`
              : `No ${runType === "Lite" ? "Lite" : "Standard"} Clears yet.`
          }
          slotsLabel={view === "survival" ? "Furthest" : "Slots"}
        />
      )}
    </main>
  );
}

function BoardTable({
  loading,
  loadError,
  entries,
  empty,
  slotsLabel,
}: {
  loading: boolean;
  loadError: string | null;
  entries: LeaderboardEntry[];
  empty: string;
  slotsLabel: string;
}) {
  return (
    <div className="feed-list mt-5">
      <div className="feed-head grid grid-cols-[3rem_1fr_6rem_5rem_8rem] gap-3 border-b border-gold/20 py-3.5 text-sm text-faint sm:grid-cols-[3rem_1fr_7rem_6rem_8rem]">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Lineup</span>
        <span className="text-center">{slotsLabel}</span>
        <span className="hidden text-right sm:block">Finished</span>
      </div>

      {loading && <p className="py-14 text-sm text-faint">Loading…</p>}

      {!loading && !loadError && entries.length === 0 && (
        <p className="py-14 text-sm text-faint">{empty}</p>
      )}

      <ol>
        {entries.map((entry, index) => {
          const gap =
            index === 0 ? null : entries[index - 1].totalScore - entry.totalScore;
          return (
            <li key={entry.runId} className="feed-row">
              <div className="grid grid-cols-[3rem_1fr_6rem_5rem_8rem] items-center gap-3 py-3.5 text-sm sm:grid-cols-[3rem_1fr_7rem_6rem_8rem]">
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
                  className="text-right font-mono tabular-nums text-muted"
                >
                  {formatScore(entry.totalScore)}
                  {gap != null && gap > 0 && (
                    <span className="mt-0.5 block text-[11px] text-faint">
                      {formatScore(gap)} behind
                    </span>
                  )}
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
          );
        })}
      </ol>
    </div>
  );
}

function HallOfFame({
  loading,
  seasons,
}: {
  loading: boolean;
  seasons: SeasonChampion[];
}) {
  return (
    <div className="feed-list mt-5">
      <div className="feed-head grid grid-cols-[7rem_1fr_1fr] gap-3 border-b border-gold/20 py-3.5 text-sm text-faint">
        <span>Month</span>
        <span>Standard</span>
        <span>Lite</span>
      </div>
      {loading && <p className="py-14 text-sm text-faint">Loading…</p>}
      {!loading && seasons.length === 0 && (
        <p className="py-14 text-sm text-faint">No monthly champions yet.</p>
      )}
      <ol>
        {seasons.map((season) => (
          <li key={season.season} className="feed-row">
            <div className="grid grid-cols-[7rem_1fr_1fr] items-center gap-3 py-3.5 text-sm">
              <span className="text-muted">{season.label}</span>
              <ChampCell entry={season.standard} />
              <ChampCell entry={season.lite} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChampCell({ entry }: { entry: LeaderboardEntry | null }) {
  if (!entry) return <span className="text-faint">—</span>;
  return (
    <Link href={`/u/${encodeURIComponent(entry.streamerName)}`} className="hover:text-gold">
      <span className="text-ink">{entry.streamerName}</span>
      <span className="ml-2 font-mono text-faint tabular-nums">
        {formatScore(entry.totalScore)}
      </span>
    </Link>
  );
}
