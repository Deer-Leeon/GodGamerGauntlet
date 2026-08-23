"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getGames,
  getUsers,
  initializeRun,
  type Game,
  type Run,
  type User,
} from "@/lib/api";

const SLOT_COUNT = 10;

/** Slot score: BaseDifficulty * (1 + 0.1 * (Position - 1)^2) */
function slotScore(baseDifficulty: number, position: number): number {
  return baseDifficulty * (1 + 0.1 * Math.pow(position - 1, 2));
}

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function DraftRoomPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [slots, setSlots] = useState<(Game | null)[]>(
    Array(SLOT_COUNT).fill(null),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [createdRun, setCreatedRun] = useState<Run | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getUsers(), getGames()])
      .then(([fetchedUsers, fetchedGames]) => {
        if (cancelled) return;
        setUsers(fetchedUsers);
        setGames(fetchedGames);
        const demo = fetchedUsers.find((u) => u.username === "GodGamerDemo");
        setSelectedUserId(demo?.id ?? fetchedUsers[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Failed to reach the API.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const draftedIds = useMemo(
    () => new Set(slots.filter((g): g is Game => g !== null).map((g) => g.id)),
    [slots],
  );

  const filledCount = draftedIds.size;
  const boardFull = slots.every((slot) => slot !== null);

  const totalProjectedScore = useMemo(
    () =>
      slots.reduce(
        (sum, game, index) =>
          game ? sum + slotScore(game.baseDifficulty, index + 1) : sum,
        0,
      ),
    [slots],
  );

  function addGame(game: Game) {
    setSlots((current) => {
      const firstEmpty = current.indexOf(null);
      if (firstEmpty === -1) return current;
      const next = [...current];
      next[firstEmpty] = game;
      return next;
    });
  }

  function removeSlot(index: number) {
    setSlots((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
  }

  function moveSlot(index: number, direction: -1 | 1) {
    setSlots((current) => {
      const target = index + direction;
      if (target < 0 || target >= SLOT_COUNT) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function launchGauntlet() {
    if (!boardFull || !selectedUserId) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const gameIds = slots.map((game) => game!.id);
      const run = await initializeRun(selectedUserId, gameIds);
      setCreatedRun(run);
    } catch (error: unknown) {
      setLaunchError(
        error instanceof Error ? error.message : "Failed to initialize run.",
      );
    } finally {
      setLaunching(false);
    }
  }

  if (createdRun) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <p className="font-heading text-sm uppercase tracking-[0.3em] text-accent-win">
          Gauntlet Initialized
        </p>
        <h1 className="font-heading text-4xl font-bold">The stakes are set.</h1>
        <div className="panel w-full rounded-2xl p-6 text-left">
          <dl className="space-y-4">
            <div>
              <dt className="text-xs uppercase tracking-widest text-gray-400">
                Run ID
              </dt>
              <dd className="font-mono text-sm text-accent-win">
                {createdRun.id}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-gray-400">
                Total Difficulty Score
              </dt>
              <dd className="font-mono text-3xl font-bold text-accent-streak">
                {formatScore(createdRun.totalDifficultyScore)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-gray-400">
                Status
              </dt>
              <dd className="font-mono text-sm">{createdRun.status}</dd>
            </div>
          </dl>
        </div>
        <Link
          href={`/run/${createdRun.id}`}
          className="rounded-xl bg-accent-win px-8 py-3 font-heading text-lg font-bold text-dark transition hover:brightness-110"
        >
          Proceed to Live Run Tracker →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      {/* Live Score Header */}
      <header className="panel sticky top-4 z-10 mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-surface/90 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="font-heading text-2xl font-bold">The Draft Room</h1>
          <p className="text-sm text-gray-400">
            Build your 10-game gauntlet. Later slots multiply the pain.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-gray-400">
            Total Projected Score
          </p>
          <p className="font-mono text-4xl font-bold text-accent-streak">
            {formatScore(totalProjectedScore)}
          </p>
          <p className="font-mono text-xs text-gray-500">
            {filledCount}/{SLOT_COUNT} slots drafted
          </p>
        </div>
      </header>

      {loadError && (
        <div className="panel mb-8 rounded-xl border-accent-death/40 p-4 text-sm text-accent-death">
          Could not load draft data: {loadError}
        </div>
      )}

      {/* User Selector */}
      <section className="mb-8">
        <label
          htmlFor="user-select"
          className="mb-2 block text-xs uppercase tracking-widest text-gray-400"
        >
          Active Streamer
        </label>
        <select
          id="user-select"
          value={selectedUserId}
          onChange={(event) => setSelectedUserId(event.target.value)}
          disabled={loading || users.length === 0}
          className="panel w-full max-w-sm rounded-xl bg-surface px-4 py-3 font-heading text-sm outline-none focus:border-accent-win/60"
        >
          {users.length === 0 ? (
            <option value="">
              {loading ? "Loading users…" : "No users available"}
            </option>
          ) : (
            users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.username}
              </option>
            ))
          )}
        </select>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        {/* Available Games Catalog */}
        <section>
          <h2 className="mb-4 font-heading text-lg font-bold uppercase tracking-wide text-gray-300">
            Game Catalog
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="panel h-24 animate-pulse rounded-xl"
                  aria-hidden
                />
              ))}
            {games.map((game) => {
              const drafted = draftedIds.has(game.id);
              return (
                <li
                  key={game.id}
                  className="panel flex flex-col justify-between gap-3 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading font-semibold">
                      {game.title}
                    </span>
                    <span className="font-mono text-sm text-accent-streak">
                      {game.baseDifficulty}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => addGame(game)}
                    disabled={drafted || boardFull}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-semibold transition enabled:hover:border-accent-win/60 enabled:hover:text-accent-win disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {drafted ? "Drafted" : "Add to Draft"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* The 10-Slot Gauntlet Board */}
        <section>
          <h2 className="mb-4 font-heading text-lg font-bold uppercase tracking-wide text-gray-300">
            Gauntlet Board
          </h2>
          <ol className="space-y-2">
            {slots.map((game, index) => {
              const position = index + 1;
              const multiplier = 1 + 0.1 * Math.pow(position - 1, 2);
              return (
                <li
                  key={position}
                  className={`panel flex items-center gap-4 rounded-xl px-4 py-3 ${
                    game ? "" : "border-dashed opacity-70"
                  }`}
                >
                  <span className="font-mono text-lg font-bold text-gray-500">
                    {String(position).padStart(2, "0")}
                  </span>
                  {game ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading font-semibold">
                          {game.title}
                        </p>
                        <p className="font-mono text-xs text-gray-400">
                          {game.baseDifficulty} × {multiplier.toFixed(1)} ={" "}
                          <span className="text-accent-win">
                            {formatScore(
                              slotScore(game.baseDifficulty, position),
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSlot(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${game.title} up`}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs transition enabled:hover:text-accent-win disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlot(index, 1)}
                          disabled={index === SLOT_COUNT - 1}
                          aria-label={`Move ${game.title} down`}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs transition enabled:hover:text-accent-win disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlot(index)}
                          aria-label={`Remove ${game.title}`}
                          className="rounded-md border border-white/10 px-2 py-1 text-xs text-accent-death transition hover:border-accent-death/60"
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-gray-500">
                      Empty slot — multiplier {multiplier.toFixed(1)}×
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Launch */}
          <div className="mt-6 space-y-3">
            {launchError && (
              <p className="text-sm text-accent-death">{launchError}</p>
            )}
            <button
              type="button"
              onClick={launchGauntlet}
              disabled={!boardFull || !selectedUserId || launching}
              className="w-full rounded-xl bg-accent-streak py-4 font-heading text-lg font-bold text-dark transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-gray-500"
            >
              {launching
                ? "Initializing…"
                : boardFull
                  ? "Launch Gauntlet"
                  : `Fill all ${SLOT_COUNT} slots to launch (${filledCount}/${SLOT_COUNT})`}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
