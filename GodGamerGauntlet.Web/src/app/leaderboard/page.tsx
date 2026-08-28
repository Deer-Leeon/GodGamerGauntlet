"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatSpeedrunTime } from "@/components/SpeedrunTimer";
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

/** Gauntlet clock as H:MM:SS (no centiseconds); "—" when the timer was unused. */
function formatClock(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  return formatSpeedrunTime(ms).split(".")[0];
}

export default function LeaderboardPage() {
  const [runType, setRunType] = useState<RunType>("Standard");
  const [view, setView] = useState<View>("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [seasons, setSeasons] = useState<SeasonChampion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState<LeaderboardEntry | null>(null);

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
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">God Gamer Arena</h1>
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
          onInspect={setInspecting}
        />
      )}

      {inspecting && (
        <InspectWheelModal
          entry={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </main>
  );
}

const BOARD_GRID =
  "grid-cols-[2.5rem_1fr_5.5rem_3.5rem_3.5rem] sm:grid-cols-[3rem_1fr_7rem_6.5rem_4.5rem_8rem_4rem]";

function BoardTable({
  loading,
  loadError,
  entries,
  empty,
  slotsLabel,
  onInspect,
}: {
  loading: boolean;
  loadError: string | null;
  entries: LeaderboardEntry[];
  empty: string;
  slotsLabel: string;
  onInspect: (entry: LeaderboardEntry) => void;
}) {
  return (
    <div className="feed-list mt-5">
      <div
        className={`feed-head grid ${BOARD_GRID} gap-3 border-b border-gold/20 py-3.5 text-sm text-faint`}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Score</span>
        <span className="hidden text-right sm:block">Time</span>
        <span className="text-center">{slotsLabel}</span>
        <span className="hidden text-right sm:block">Finished</span>
        <span className="text-center">Wheel</span>
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
              <div
                className={`grid ${BOARD_GRID} items-center gap-3 py-3.5 text-sm`}
              >
                <Link
                  href={`/run/${entry.runId}`}
                  className="font-mono tabular-nums text-gold"
                  title="Open the run"
                >
                  {entry.rank === 1 ? "🏆 1" : entry.rank}
                </Link>
                <Link
                  href={`/u/${encodeURIComponent(entry.streamerName)}`}
                  className="flex min-w-0 items-center gap-2 font-medium text-ink hover:text-gold"
                >
                  {entry.avatarUrl ? (
                    // Free-form external URL — next/image needs domain allowlisting.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.avatarUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full border border-gold/25 object-cover"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-white/5 font-mono text-[10px] text-faint">
                      {entry.streamerName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{entry.streamerName}</span>
                </Link>
                <Link
                  href={`/run/${entry.runId}`}
                  className="text-right font-mono font-semibold tabular-nums text-gold"
                >
                  {formatScore(entry.totalScore)}
                  {gap != null && gap > 0 && (
                    <span className="mt-0.5 block text-[11px] font-normal text-faint">
                      {formatScore(gap)} behind
                    </span>
                  )}
                </Link>
                <span className="hidden text-right font-mono text-sm tabular-nums text-muted sm:block">
                  {formatClock(entry.elapsedMs)}
                </span>
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
                <span className="text-center">
                  <button
                    type="button"
                    onClick={() => onInspect(entry)}
                    title={`Inspect ${entry.streamerName}'s drafted wheel`}
                    aria-label={`Inspect ${entry.streamerName}'s drafted wheel`}
                    className="border border-gold/25 px-2 py-1 text-xs text-faint transition hover:border-gold/50 hover:text-gold"
                  >
                    ⊙
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The drafted lineup behind one board entry: covers, order, difficulty, splits. */
function InspectWheelModal({
  entry,
  onClose,
}: {
  entry: LeaderboardEntry;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.streamerName}'s drafted wheel`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto border border-gold/30 bg-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gold/20 px-5 py-4">
          <span className="font-medium text-ink">{entry.streamerName}</span>
          <span className="font-mono font-semibold tabular-nums text-gold">
            {formatScore(entry.totalScore)}
          </span>
          <span className="font-mono text-sm tabular-nums text-muted">
            {formatClock(entry.elapsedMs)}
          </span>
          <span className="text-sm text-faint">
            {entry.runType === "Lite" ? "Lite" : "Standard"} ·{" "}
            {entry.slotsCompleted}/{entry.totalSlots}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-faint transition hover:text-ink"
          >
            ✕
          </button>
        </div>

        {entry.games.length === 0 ? (
          <p className="px-5 py-8 text-sm text-faint">
            No lineup details for this run.
          </p>
        ) : (
          <ol className="divide-y divide-white/5">
            {entry.games.map((slot) => (
              <li
                key={slot.position}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm ${
                  slot.status === "Pending" ? "opacity-45" : ""
                }`}
              >
                <span className="w-5 shrink-0 font-mono text-xs text-faint">
                  {slot.position}
                </span>
                <span className="relative h-9 w-9 shrink-0 overflow-hidden bg-white/5">
                  {slot.thumb ? (
                    <Image
                      src={slot.thumb}
                      alt=""
                      fill
                      unoptimized
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-mono text-[10px] text-faint">
                      {slot.title.slice(0, 1)}
                    </span>
                  )}
                  {slot.status === "Lost" && (
                    <span aria-hidden className="absolute inset-0 bg-red-950/50" />
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${
                    slot.status === "Lost" ? "text-red-300/80" : "text-ink"
                  }`}
                >
                  {slot.title}
                </span>
                <span
                  className="shrink-0 font-mono text-xs tabular-nums text-muted"
                  title="Base difficulty"
                >
                  {slot.baseDifficulty}
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-faint">
                  {slot.status === "Won" ? formatClock(slot.splitTimeMs) : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
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
