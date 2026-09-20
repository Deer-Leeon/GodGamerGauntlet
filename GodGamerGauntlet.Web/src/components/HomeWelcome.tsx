"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGames, type Game } from "@/lib/api";
import { GAUNTLET_MODES } from "@/lib/site";
import RosterGrid from "@/components/RosterGrid";

export default function HomeWelcome() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getGames()
      .then((fetched) => {
        if (!cancelled) setGames(fetched);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <section className="border border-gold/25 bg-gold/5 px-6 py-8">
        <h1 className="text-3xl font-semibold text-ink">God Gamer Gauntlet</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Draft 3, 5, or 7 full games from these 19, speedrun them start to
          finish, and post the Clear.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faint">
          A solo speedrun gauntlet — not a multiplayer win-streak.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2 text-sm">
          {GAUNTLET_MODES.map((mode) => (
            <li
              key={mode.id}
              className="border border-gold/30 px-3 py-1.5 text-muted"
            >
              <span className="text-ink">{mode.label}</span>
              <span className="text-faint"> · {mode.games} games</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link
            href="/how"
            className="bg-gold px-5 py-2.5 text-dark transition hover:bg-gold/90"
          >
            How it works
          </Link>
          <Link
            href="/records"
            className="border border-gold/30 px-5 py-2.5 text-muted transition hover:border-gold hover:text-ink"
          >
            See the 19 games
          </Link>
          <Link
            href="/draft"
            className="border border-gold/30 px-5 py-2.5 text-muted transition hover:border-gold hover:text-ink"
          >
            Draft a lineup
          </Link>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="home-roster-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-roster-heading" className="text-sm font-medium text-ink">
            The 19 games
          </h2>
          <Link href="/records" className="text-sm text-faint hover:text-gold">
            Game boards
          </Link>
        </div>
        <RosterGrid games={games} loading={loading} />
      </section>
    </div>
  );
}
