"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getGames,
  getUsers,
  initializeRun,
  type Game,
  type Run,
  type User,
} from "@/lib/api";
import {
  PAGE_SIZE,
  highlightTitle,
  pageWindow,
  parseQuery,
  searchGames,
  type CatalogSort,
} from "@/lib/catalogSearch";

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

function GamePrice({ game }: { game: Game }) {
  // RAWG-sourced games carry no pricing; hide the tag entirely.
  if (game.normalPrice === null || game.normalPrice <= 0) return null;
  const discounted =
    game.salePrice !== null &&
    game.salePrice > 0 &&
    game.salePrice < game.normalPrice;
  return (
    <p className="font-mono text-xs">
      {discounted ? (
        <>
          <span className="text-accent-win">${game.salePrice!.toFixed(2)}</span>{" "}
          <span className="text-gray-500 line-through">
            ${game.normalPrice.toFixed(2)}
          </span>
        </>
      ) : (
        <span className="text-gray-400">${game.normalPrice.toFixed(2)}</span>
      )}
    </p>
  );
}

function GameThumb({ game }: { game: Game }) {
  if (!game.thumb) {
    return (
      <span
        aria-hidden
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 font-heading text-lg font-bold text-gray-600"
      >
        {game.title.charAt(0)}
      </span>
    );
  }
  return (
    <Image
      src={game.thumb}
      alt=""
      width={64}
      height={48}
      unoptimized
      className="h-12 w-16 shrink-0 rounded-lg border border-white/10 object-cover"
    />
  );
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("title");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingInField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (
        (event.key === "/" ||
          (event.key === "k" && (event.metaKey || event.ctrlKey))) &&
        !typingInField
      ) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const rankedGames = useMemo(
    () => searchGames(games, query, sort),
    [games, query, sort],
  );
  const pageCount = Math.max(1, Math.ceil(rankedGames.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedGames = rankedGames.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const highlightTokens = useMemo(() => parseQuery(query).titleTokens, [query]);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
    setSort((current) =>
      value.trim() && current === "title" ? "relevance" : current,
    );
  }

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
          <Link
            href="/leaderboard"
            className="mt-1 inline-block font-heading text-sm font-semibold text-accent-win transition hover:brightness-125"
          >
            View Global Leaderboard →
          </Link>
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
        <section ref={catalogRef}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold uppercase tracking-wide text-gray-300">
                Game Catalog
              </h2>
              <p className="mt-1 text-xs text-gray-500" aria-live="polite">
                {loading
                  ? "Loading catalog…"
                  : rankedGames.length === games.length
                    ? `${games.length.toLocaleString()} games`
                    : `${rankedGames.length.toLocaleString()} of ${games.length.toLocaleString()} games`}
                {!loading && pageCount > 1
                  ? ` · page ${currentPage} of ${pageCount}`
                  : null}
              </p>
            </div>
          </div>

          <div className="mb-4 space-y-3">
            <label className="sr-only" htmlFor="catalog-search">
              Search games
            </label>
            <div className="panel relative flex items-center rounded-xl focus-within:border-accent-win/60">
              <span aria-hidden className="pl-4 text-gray-500">
                ⌕
              </span>
              <input
                ref={searchRef}
                id="catalog-search"
                type="search"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search titles, or try sale  <$10  >80"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent px-3 py-3 font-heading text-sm outline-none placeholder:text-gray-600"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => updateQuery("")}
                  className="mr-2 rounded-md px-2 py-1 text-xs text-gray-400 transition hover:text-accent-win"
                >
                  Clear
                </button>
              ) : (
                <kbd className="mr-3 hidden rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 sm:inline">
                  /
                </kbd>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] leading-relaxed text-gray-600">
                Tokens match any word. Operators:{" "}
                <span className="font-mono text-gray-500">sale</span>{" "}
                <span className="font-mono text-gray-500">free</span>{" "}
                <span className="font-mono text-gray-500">&gt;80</span>{" "}
                <span className="font-mono text-gray-500">&lt;$10</span>
              </p>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as CatalogSort);
                  setPage(1);
                }}
                className="panel rounded-lg bg-surface px-3 py-1.5 font-heading text-xs outline-none focus:border-accent-win/60"
                aria-label="Sort catalog"
              >
                <option value="relevance">Best match</option>
                <option value="title">Title A–Z</option>
                <option value="difficulty">Difficulty</option>
                <option value="price">Price: low to high</option>
                <option value="sale">On sale first</option>
              </select>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="panel h-24 animate-pulse rounded-xl"
                  aria-hidden
                />
              ))}
            {!loading && games.length === 0 && (
              <li className="panel col-span-full rounded-xl p-6 text-sm text-gray-400">
                Catalog is empty. Games show up here after RAWG sync finishes.
              </li>
            )}
            {!loading && games.length > 0 && pagedGames.length === 0 && (
              <li className="panel col-span-full rounded-xl p-6 text-sm text-gray-400">
                No games match{" "}
                <span className="font-mono text-accent-win">{query}</span>. Try a
                shorter title, or drop filters like{" "}
                <span className="font-mono">sale</span>.
              </li>
            )}
            {pagedGames.map(({ game }) => {
              const drafted = draftedIds.has(game.id);
              return (
                <li
                  key={game.id}
                  className="panel flex flex-col justify-between gap-3 rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <GameThumb game={game} />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-heading font-semibold">
                        {highlightTitle(game.title, highlightTokens).map(
                          (part, index) =>
                            part.hit ? (
                              <mark
                                key={index}
                                className="rounded-sm bg-accent-streak/20 text-accent-streak"
                              >
                                {part.text}
                              </mark>
                            ) : (
                              <span key={index}>{part.text}</span>
                            ),
                        )}
                      </span>
                      <GamePrice game={game} />
                    </div>
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

          <CatalogPager
            page={currentPage}
            pageCount={pageCount}
            onPage={(next) => {
              setPage(next);
              catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
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

function CatalogPager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const items = pageWindow(page, pageCount);

  return (
    <nav
      className="mt-5 flex flex-wrap items-center justify-center gap-1.5"
      aria-label="Catalog pages"
    >
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-white/10 px-3 py-1.5 font-heading text-xs transition enabled:hover:border-accent-win/60 enabled:hover:text-accent-win disabled:opacity-30"
      >
        Prev
      </button>
      {items.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 font-mono text-xs text-gray-600">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPage(item)}
            aria-current={item === page ? "page" : undefined}
            className={`min-w-8 rounded-lg px-2.5 py-1.5 font-mono text-xs transition ${
              item === page
                ? "bg-accent-streak font-bold text-dark"
                : "border border-white/10 hover:border-accent-win/60 hover:text-accent-win"
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pageCount}
        className="rounded-lg border border-white/10 px-3 py-1.5 font-heading text-xs transition enabled:hover:border-accent-win/60 enabled:hover:text-accent-win disabled:opacity-30"
      >
        Next
      </button>
    </nav>
  );
}
