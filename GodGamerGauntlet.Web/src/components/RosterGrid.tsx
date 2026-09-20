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
      className="game-card"
    >
      <span className="relative block aspect-[2/1] overflow-hidden bg-[repeating-conic-gradient(#ececec_0%_25%,#ffffff_0%_50%)] bg-size-[10px_10px]">
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
          <span className="flex h-full items-center justify-center px-2 text-center font-pixel text-[9px] leading-4 text-muted">
            {game.title}
          </span>
        )}
      </span>
      <span className="block truncate border-t-2 border-ink/15 bg-white px-2.5 py-2 text-[13px] font-medium leading-tight text-ink">
        {game.title}
      </span>
    </Link>
  );
}
