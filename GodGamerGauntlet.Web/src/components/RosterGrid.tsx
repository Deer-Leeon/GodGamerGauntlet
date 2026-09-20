"use client";

import Image from "next/image";
import Link from "next/link";
import type { Game } from "@/lib/api";

export default function RosterGrid({
  games,
  loading,
}: {
  games: Game[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <p className="text-sm text-faint">Loading the 19-game roster…</p>
    );
  }

  if (games.length === 0) {
    return (
      <p className="text-sm text-faint">
        The roster did not load.{" "}
        <Link href="/records" className="text-gold hover:underline">
          Open Games
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
      {games.map((game) => (
        <li key={game.id}>
          <Link
            href={`/records/${game.id}`}
            title={game.title}
            className="group block border border-gold/20 bg-surface transition hover:border-gold/50"
          >
            <span className="relative block aspect-[4/3] overflow-hidden bg-white/5">
              {game.thumb ? (
                <Image
                  src={game.thumb}
                  alt=""
                  fill
                  unoptimized
                  sizes="160px"
                  className="object-cover opacity-90 transition group-hover:opacity-100"
                />
              ) : (
                <span className="flex h-full items-center justify-center font-mono text-lg text-faint">
                  {game.title.slice(0, 1)}
                </span>
              )}
            </span>
            <span className="block truncate px-1.5 py-1.5 text-[11px] leading-tight text-muted group-hover:text-ink">
              {game.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
