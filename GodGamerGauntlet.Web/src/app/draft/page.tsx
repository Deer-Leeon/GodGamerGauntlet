"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  getGames,
  initializeRun,
  RUN_TYPE_SLOTS,
  type Game,
  type Run,
  type RunType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RunTypeBadge } from "@/components/RunTypeBadge";
import {
  PAGE_SIZE,
  highlightTitle,
  pageWindow,
  parseQuery,
  searchGames,
  type CatalogSort,
} from "@/lib/catalogSearch";

const MODES: { id: RunType; label: string; blurb: string }[] = [
  {
    id: "Standard",
    label: "Standard",
    blurb: "Ten games. Later slots multiply the score.",
  },
  {
    id: "Lite",
    label: "Lite",
    blurb: "Five games. Ranked on its own board.",
  },
];

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
    <p className="font-mono text-xs tabular-nums text-gray-500">
      {discounted ? (
        <>
          <span className="text-gold">${game.salePrice!.toFixed(2)}</span>{" "}
          <span className="text-gray-600 line-through">
            ${game.normalPrice.toFixed(2)}
          </span>
        </>
      ) : (
        <span>${game.normalPrice.toFixed(2)}</span>
      )}
    </p>
  );
}

function GameThumb({ game }: { game: Game }) {
  const [broken, setBroken] = useState(false);
  if (!game.thumb || broken) {
    return (
      <span
        aria-hidden
        className="flex h-12 w-16 shrink-0 items-center justify-center bg-white/5 text-lg font-semibold text-gray-600"
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
      onError={() => setBroken(true)}
      className="h-12 w-16 shrink-0 object-cover"
    />
  );
}

export default function DraftRoomPage() {
  const { user, loading: authLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [runType, setRunType] = useState<RunType>("Standard");
  const slotCount = RUN_TYPE_SLOTS[runType];
  const activeMode = MODES.find((m) => m.id === runType) ?? MODES[0];
  const [slots, setSlots] = useState<(Game | null)[]>(() =>
    Array(RUN_TYPE_SLOTS.Standard).fill(null),
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [createdRun, setCreatedRun] = useState<Run | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("featured");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;

    getGames()
      .then((fetchedGames) => {
        if (cancelled) return;
        setGames(fetchedGames);
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
      value.trim() && current === "featured" ? "relevance" : current,
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
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  /**
   * Resizes the board, keeping drafted picks in order. Shrinking to Lite drops
   * anything past the fifth pick, so the board is never left over capacity.
   */
  function changeMode(next: RunType) {
    if (next === runType) return;
    const size = RUN_TYPE_SLOTS[next];
    setRunType(next);
    setLaunchError(null);
    setSlots((current) => {
      const drafted = current.filter((game): game is Game => game !== null);
      return Array.from({ length: size }, (_, i) => drafted[i] ?? null);
    });
  }

  async function launchGauntlet() {
    if (!boardFull || !user) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const gameIds = slots.map((game) => game!.id);
      const run = await initializeRun(gameIds, runType);
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
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-sm text-muted">Run ready</p>
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold">Lineup locked</h1>
          <RunTypeBadge runType={createdRun.runType} />
        </div>
        <dl className="mt-6 border-t border-gold/20">
          <div className="flex items-baseline justify-between gap-4 border-b border-gold/20 py-3">
            <dt className="text-sm text-muted">Run ID</dt>
            <dd className="truncate font-mono text-sm text-ink">
              {createdRun.id}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-gold/20 py-3">
            <dt className="text-sm text-muted">Projected score</dt>
            <dd className="font-mono text-xl tabular-nums text-gold">
              {formatScore(createdRun.totalDifficultyScore)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b border-gold/20 py-3">
            <dt className="text-sm text-muted">Status</dt>
            <dd className="text-sm text-ink">
              {createdRun.status} · {createdRun.totalSlots} games
            </dd>
          </div>
        </dl>
        <Link
          href={`/run/${createdRun.id}`}
          className="mt-8 self-start bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Open run tracker
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gold/20 pb-5">
        <div>
          <h1 className="text-2xl font-semibold">Draft Room</h1>
          <p className="mt-1 text-sm text-muted">
            Build a {slotCount}-game gauntlet. Later slots multiply the score.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Projected</p>
          <p className="font-mono text-2xl tabular-nums text-gold">
            {formatScore(totalProjectedScore)}
          </p>
          <p className="font-mono text-xs tabular-nums text-muted">
            {filledCount}/{slotCount} slots
          </p>
        </div>
      </header>

      <div
        role="radiogroup"
        aria-label="Gauntlet mode"
        className="mt-5 flex gap-5 border-b border-gold/20 text-sm"
      >
        {MODES.map((mode) => (
          <button
            key={mode.id}
            role="radio"
            aria-checked={runType === mode.id}
            onClick={() => changeMode(mode.id)}
            className={`-mb-px border-b-2 pb-2 transition ${
              runType === mode.id
                ? "border-gold text-gold"
                : "border-transparent text-muted/70 hover:text-ink"
            }`}
          >
            {mode.label}
            <span className="ml-1.5 text-gray-600">
              {RUN_TYPE_SLOTS[mode.id]}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{activeMode.blurb}</p>

      {loadError && (
        <p className="mt-4 text-sm text-red-400/90">
          Could not load draft data: {loadError}
        </p>
      )}

      {!authLoading && !user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-gold/25 px-4 py-3">
          <p className="text-sm text-muted">
            Sign in to launch a gauntlet — the run is posted under your name.
          </p>
          <Link
            href="/login"
            className="bg-gold px-3 py-1.5 text-sm text-dark transition hover:bg-gold/90"
          >
            Sign in
          </Link>
        </div>
      )}
      {user && (
        <p className="mt-4 text-sm text-gray-500">
          Drafting as <span className="text-ink">{user.username}</span>
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_24rem]">
        <section ref={catalogRef}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm text-gray-500">Catalog</h2>
              <p className="mt-1 text-xs text-gray-600" aria-live="polite">
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
            <div className="relative flex items-center border border-gold/20">
              <span aria-hidden className="pl-3 text-gray-500">
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
                className="w-full bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-gray-600"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => updateQuery("")}
                  className="mr-2 px-2 py-1 text-xs text-gray-400 transition hover:text-ink"
                >
                  Clear
                </button>
              ) : (
                <kbd className="mr-3 hidden border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 sm:inline">
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
                className="border border-gold/20 bg-surface px-3 py-1.5 text-xs text-ink outline-none"
                aria-label="Sort catalog"
              >
                <option value="featured">Featured &amp; popular</option>
                <option value="relevance">Best match</option>
                <option value="title">Title A–Z</option>
                <option value="difficulty">Difficulty</option>
                <option value="price">Price: low to high</option>
                <option value="sale">On sale first</option>
              </select>
            </div>
          </div>

          <ul className="feed-list">
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <li
                  key={i}
                  className="h-16 animate-pulse border-b border-white/8"
                  aria-hidden
                />
              ))}
            {!loading && games.length === 0 && (
              <li className="py-8 text-sm text-gray-500">
                Catalog is empty. Games show up here after RAWG sync finishes.
              </li>
            )}
            {!loading && games.length > 0 && pagedGames.length === 0 && (
              <li className="py-8 text-sm text-gray-500">
                No games match{" "}
                <span className="font-mono text-ink">{query}</span>. Try a
                shorter title, or drop filters like{" "}
                <span className="font-mono">sale</span>.
              </li>
            )}
            {pagedGames.map(({ game }) => {
              const drafted = draftedIds.has(game.id);
              return (
                <li key={game.id} className="feed-row flex items-center gap-3 py-3">
                  <GameThumb game={game} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {highlightTitle(game.title, highlightTokens).map(
                        (part, index) =>
                          part.hit ? (
                            <mark
                              key={index}
                              className="bg-white/10 text-ink"
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
                  <span className="shrink-0 font-mono text-sm tabular-nums text-gold">
                    {game.baseDifficulty}
                  </span>
                  <button
                    type="button"
                    onClick={() => addGame(game)}
                    disabled={drafted || boardFull}
                    className="shrink-0 border border-gold/30 px-2.5 py-1 text-xs text-gold transition enabled:hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {drafted ? "Drafted" : "Add"}
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

        <section>
          <h2 className="mb-3 flex flex-wrap items-baseline gap-2 text-sm text-gray-500">
            Lineup
            <span className="font-mono tabular-nums text-gray-600">
              {slotCount} slots
            </span>
            <RunTypeBadge runType={runType} />
          </h2>
          <ol className="feed-list">
            {slots.map((game, index) => {
              const position = index + 1;
              const multiplier = 1 + 0.1 * Math.pow(position - 1, 2);
              return (
                <li
                  key={position}
                  className={`feed-row flex items-center gap-3 py-2.5 ${
                    game ? "" : "opacity-50"
                  }`}
                >
                  <span className="w-6 shrink-0 font-mono text-sm tabular-nums text-gray-500">
                    {position}
                  </span>
                  {game ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{game.title}</p>
                        <p className="font-mono text-xs tabular-nums text-muted">
                          {game.baseDifficulty} × {multiplier.toFixed(1)} ={" "}
                          <span className="text-gold">
                            {formatScore(slotScore(game.baseDifficulty, position))}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSlot(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${game.title} up`}
                          className="px-1.5 py-0.5 text-xs text-gray-500 transition enabled:hover:text-ink disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlot(index, 1)}
                          disabled={index === slots.length - 1}
                          aria-label={`Move ${game.title} down`}
                          className="px-1.5 py-0.5 text-xs text-gray-500 transition enabled:hover:text-ink disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlot(index)}
                          aria-label={`Remove ${game.title}`}
                          className="px-1.5 py-0.5 text-xs text-gray-500 transition hover:text-red-400/80"
                        >
                          ✕
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-gray-600">
                      Empty — {multiplier.toFixed(1)}×
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 space-y-3">
            {launchError && (
              <p className="text-sm text-red-400/90">{launchError}</p>
            )}
            <button
              type="button"
              onClick={launchGauntlet}
              disabled={!boardFull || !user || launching}
              className={`w-full py-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                boardFull && user
                  ? "bg-gold text-dark hover:bg-gold/90"
                  : "border border-gold/25 text-muted"
              }`}
            >
              {launching
                ? "Starting…"
                : !user
                  ? "Sign in to launch"
                  : boardFull
                    ? runType === "Lite"
                      ? "Launch Lite run"
                      : "Launch run"
                    : `Fill all ${slotCount} slots (${filledCount}/${slotCount})`}
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
        className="border border-gold/25 px-3 py-1.5 text-xs text-muted transition enabled:hover:text-gold disabled:opacity-30"
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
            className={`min-w-8 px-2.5 py-1.5 font-mono text-xs tabular-nums transition ${
              item === page
                ? "bg-gold text-dark"
                : "border border-gold/25 text-muted hover:text-gold"
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
        className="border border-gold/25 px-3 py-1.5 text-xs text-muted transition enabled:hover:text-gold disabled:opacity-30"
      >
        Next
      </button>
    </nav>
  );
}
