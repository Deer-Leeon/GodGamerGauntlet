"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/components/RunSocial";
import { getPlayers, type PlayerCard } from "@/lib/api";

const COLS =
  "sm:grid-cols-[minmax(0,1.3fr)_4rem_4rem_minmax(0,11rem)_5.25rem]";

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerCard[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getPlayers()
      .then((fetched) => {
        if (!cancelled) setPlayers(fetched);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load players.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((player) =>
      player.username.toLowerCase().includes(needle),
    );
  }, [players, query]);

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="border-b-2 border-ink/15 pb-6">
        <p className="font-pixel text-[10px] leading-6 text-banner">
          PLAYER SELECT
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Players</h1>
        <div className="mt-3 h-1.5 w-20 bg-banner" />
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Look up anyone and open their gauntlet history.
        </p>
      </header>

      <label className="sr-only" htmlFor="player-search">
        Search players
      </label>
      <div className="field mt-8 flex items-center">
        <span aria-hidden className="pl-4 text-faint">
          ⌕
        </span>
        <input
          id="player-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search players"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent px-3 py-3 text-sm text-ink placeholder:text-faint"
        />
      </div>

      {loadError && (
        <p className="py-6 text-sm text-red-400/90">{loadError}</p>
      )}

      <div className="feed-list mt-5">
        <div
          className={`feed-head hidden ${COLS} items-center gap-3 border-b border-ink/10 py-2 text-xs uppercase tracking-wide text-faint sm:grid`}
        >
          <span>Player</span>
          <span className="text-right">Clears</span>
          <span className="text-right">DNFs</span>
          <span className="text-right">Best rank</span>
          <span className="text-right">Last run</span>
        </div>

        {loading && (
          <p className="py-14 text-sm text-faint">Loading players…</p>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <p className="py-14 text-sm text-faint">
            {players.length === 0
              ? "No players yet."
              : `No players matching “${query.trim()}”.`}
          </p>
        )}

        <ol>
          {filtered.map((player) => (
            <li key={player.username} className="feed-row">
              <Link
                href={`/u/${encodeURIComponent(player.username)}`}
                className={`grid grid-cols-1 items-center gap-x-3 gap-y-0.5 py-2 text-sm sm:grid ${COLS} sm:h-11 sm:overflow-hidden sm:py-0`}
              >
                <span className="truncate font-medium text-ink hover:text-banner">
                  {player.username}
                </span>
                <span className="hidden whitespace-nowrap text-right font-mono tabular-nums text-muted sm:block">
                  {player.clearCount}
                </span>
                <span className="hidden whitespace-nowrap text-right font-mono tabular-nums text-muted sm:block">
                  {player.dnfCount}
                </span>
                <span
                  title={rankTitle(player) ?? undefined}
                  className="hidden truncate whitespace-nowrap text-right font-mono tabular-nums text-muted sm:block"
                >
                  {rankLine(player) ?? "—"}
                </span>
                <span className="hidden truncate whitespace-nowrap text-right text-faint sm:block">
                  {player.lastRunAt ? timeAgo(player.lastRunAt) : "—"}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

function ranksOf(player: PlayerCard): { n: number; label: string }[] {
  const ranks: { n: number; label: string }[] = [];
  if (player.sprintRank != null) ranks.push({ n: player.sprintRank, label: "Sprint" });
  if (player.marathonRank != null) ranks.push({ n: player.marathonRank, label: "Marathon" });
  if (player.enduranceRank != null) ranks.push({ n: player.enduranceRank, label: "Endurance" });
  if (player.standardRank != null) ranks.push({ n: player.standardRank, label: "Std" });
  if (player.liteRank != null) ranks.push({ n: player.liteRank, label: "Lite" });
  return ranks;
}

function rankLine(player: PlayerCard): string | null {
  const ranks = ranksOf(player);
  if (ranks.length === 0) return null;
  const best = Math.min(...ranks.map((rank) => rank.n));
  const winners = ranks.filter((rank) => rank.n === best);
  if (winners.length === 1) return `#${winners[0].n} ${winners[0].label}`;
  return `#${best}`;
}

function rankTitle(player: PlayerCard): string | null {
  const ranks = ranksOf(player);
  if (ranks.length === 0) return null;
  return ranks.map((rank) => `#${rank.n} ${rank.label}`).join(" · ");
}
