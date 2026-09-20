"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
        <Link href="/records" className="text-banner hover:underline">
          Open Games
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {games.map((game) => (
        <li key={game.id}>
          <GameCard game={game} />
        </li>
      ))}
    </ul>
  );
}

function GameCard({ game }: { game: Game }) {
  const [broken, setBroken] = useState(false);
  const showArt = Boolean(game.thumb) && !broken;

  return (
    <Link
      href={`/records/${game.id}`}
      title={game.title}
      className="group block rounded-xl bg-surface shadow-[0_1px_2px_rgb(42_36_28_/_0.08),0_8px_20px_rgb(42_36_28_/_0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgb(42_36_28_/_0.12)]"
    >
      <span className="relative block aspect-[2/1] overflow-hidden rounded-t-xl bg-[repeating-linear-gradient(-45deg,rgb(42_36_28_/_0.04),rgb(42_36_28_/_0.04)_8px,rgb(42_36_28_/_0.08)_8px,rgb(42_36_28_/_0.08)_16px)]">
        {showArt ? (
          <Image
            src={game.thumb!}
            alt=""
            fill
            unoptimized
            sizes="220px"
            onError={() => setBroken(true)}
            className="object-cover object-center"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-2 text-center text-xs font-medium text-muted">
            {game.title}
          </span>
        )}
      </span>
      <span className="block truncate px-2.5 py-2 text-[13px] leading-tight text-ink">
        {game.title}
      </span>
    </Link>
  );
}
