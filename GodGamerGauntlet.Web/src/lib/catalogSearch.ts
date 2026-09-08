import type { Game } from "@/lib/api";

export type CatalogSort = "featured" | "relevance" | "title" | "difficulty";

export interface SearchFilters {
  titleTokens: string[];
  minDifficulty?: number;
  maxDifficulty?: number;
}

export interface RankedGame {
  game: Game;
  score: number;
}

const PAGE_SIZE = 24;

export { PAGE_SIZE };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  let i = 0;
  for (const char of haystack) {
    if (char === needle[i]) i += 1;
    if (i === needle.length) return true;
  }
  return false;
}

/**
 * Parses a roster query into title tokens plus difficulty filters (&gt;80, &lt;50).
 */
export function parseQuery(raw: string): SearchFilters {
  const filters: SearchFilters = {
    titleTokens: [],
  };

  for (const token of raw.split(/\s+/).filter(Boolean)) {
    const difficultyGt = token.match(/^>(\d{1,3})$/);
    if (difficultyGt) {
      filters.minDifficulty = Number(difficultyGt[1]);
      continue;
    }
    const difficultyLt = token.match(/^<(\d{1,3})$/);
    if (difficultyLt) {
      filters.maxDifficulty = Number(difficultyLt[1]);
      continue;
    }

    filters.titleTokens.push(token);
  }

  return filters;
}

function tokenScore(titleNorm: string, words: string[], token: string): number | null {
  const needle = normalize(token);
  if (!needle) return 0;
  if (titleNorm === needle) return 1000;
  if (words.includes(needle)) return 400;
  if (titleNorm.startsWith(needle)) return 200;
  if (titleNorm.includes(needle)) return 80;
  if (needle.length >= 3 && fuzzyIncludes(titleNorm, needle)) return 20;
  return null;
}

function matchesFilters(game: Game, filters: SearchFilters): boolean {
  if (
    filters.minDifficulty !== undefined &&
    game.baseDifficulty < filters.minDifficulty
  ) {
    return false;
  }
  if (
    filters.maxDifficulty !== undefined &&
    game.baseDifficulty > filters.maxDifficulty
  ) {
    return false;
  }
  return true;
}

/** Roster display order (PopularityRank on the closed 19). */
function compareFeatured(a: Game, b: Game): number {
  if (a.popularityRank !== b.popularityRank) {
    return a.popularityRank - b.popularityRank;
  }
  return a.title.localeCompare(b.title);
}

export function searchGames(
  games: Game[],
  query: string,
  sort: CatalogSort,
): RankedGame[] {
  const filters = parseQuery(query);
  const hasTitleQuery = filters.titleTokens.length > 0;

  const ranked: RankedGame[] = [];
  for (const game of games) {
    if (!matchesFilters(game, filters)) continue;

    const titleNorm = normalize(game.title);
    const words = titleNorm.split(" ").filter(Boolean);
    let score = 0;

    if (hasTitleQuery) {
      let matched = true;
      for (const token of filters.titleTokens) {
        const tokenMatch = tokenScore(titleNorm, words, token);
        if (tokenMatch === null) {
          matched = false;
          break;
        }
        score += tokenMatch;
      }
      if (!matched) continue;
    }

    ranked.push({ game, score });
  }

  const effectiveSort: CatalogSort =
    sort === "relevance" && !hasTitleQuery ? "featured" : sort;

  ranked.sort((a, b) => {
    switch (effectiveSort) {
      case "featured":
        return compareFeatured(a.game, b.game);
      case "relevance":
        if (b.score !== a.score) return b.score - a.score;
        return compareFeatured(a.game, b.game);
      case "difficulty":
        return b.game.baseDifficulty - a.game.baseDifficulty;
      default:
        return a.game.title.localeCompare(b.game.title);
    }
  });

  return ranked;
}

export function highlightTitle(title: string, tokens: string[]): { text: string; hit: boolean }[] {
  const needles = tokens.map(normalize).filter((t) => t.length >= 2);
  if (needles.length === 0) return [{ text: title, hit: false }];

  const pattern = new RegExp(
    `(${needles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "ig",
  );
  const parts = title.split(pattern);
  return parts.filter(Boolean).map((text) => ({
    text,
    hit: needles.some((n) => text.toLowerCase().includes(n)),
  }));
}

export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const window: (number | "gap")[] = [];
  for (const p of sorted) {
    const prev = window[window.length - 1];
    if (typeof prev === "number" && p - prev > 1) window.push("gap");
    window.push(p);
  }
  return window;
}
