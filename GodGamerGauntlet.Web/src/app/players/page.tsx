"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/components/RunSocial";
import { getPlayers, type PlayerCard } from "@/lib/api";

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
    <main className="site-content flex-1 px-6 py-10 sm:px-8">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">Players</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
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
        <div className="feed-head hidden grid-cols-[1fr_5rem_5rem_7rem_6rem] gap-3 border-b border-gold/20 py-3.5 text-sm text-faint sm:grid">
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
                className="grid grid-cols-1 items-baseline gap-1 py-3.5 text-sm sm:grid-cols-[1fr_5rem_5rem_7rem_6rem] sm:gap-3"
              >
                <span className="truncate font-medium text-ink hover:text-gold">
                  {player.username}
                </span>
                <span className="text-faint sm:hidden">
                  {player.attemptCount === 0
                    ? "No gauntlets yet"
                    : `${player.clearCount} Clear${player.clearCount === 1 ? "" : "s"} · ${player.dnfCount} DNF`}
                  {rankLine(player) ? ` · ${rankLine(player)}` : ""}
                </span>
                <span className="hidden text-right font-mono tabular-nums text-muted sm:block">
                  {player.clearCount}
                </span>
                <span className="hidden text-right font-mono tabular-nums text-muted sm:block">
                  {player.dnfCount}
                </span>
                <span className="hidden text-right font-mono tabular-nums text-muted sm:block">
                  {rankLine(player) ?? "—"}
                </span>
                <span className="hidden text-right text-sm text-faint sm:block">
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

function rankLine(player: PlayerCard): string | null {
  const parts: string[] = [];
  if (player.standardRank != null) parts.push(`#${player.standardRank} Std`);
  if (player.liteRank != null) parts.push(`#${player.liteRank} Lite`);
  return parts.length === 0 ? null : parts.join(" · ");
}
