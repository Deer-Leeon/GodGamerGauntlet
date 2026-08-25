import type { Game } from "@/lib/api";

export type CatalogSort =
  | "featured"
  | "relevance"
  | "title"
  | "difficulty"
  | "price"
  | "sale";

export interface SearchFilters {
  titleTokens: string[];
  minDifficulty?: number;
  maxDifficulty?: number;
  minPrice?: number;
  maxPrice?: number;
  onSaleOnly: boolean;
  freeOnly: boolean;
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

/** Effective price, or null when the source (RAWG) has no pricing data. */
function currentPrice(game: Game): number | null {
  if (game.normalPrice === null) return null;
  if (game.salePrice !== null && game.salePrice > 0 && game.salePrice < game.normalPrice) {
    return game.salePrice;
  }
  return game.normalPrice;
}

function isOnSale(game: Game): boolean {
  return (
    game.normalPrice !== null &&
    game.salePrice !== null &&
    game.salePrice > 0 &&
    game.salePrice < game.normalPrice
  );
}

function isFree(game: Game): boolean {
  return currentPrice(game) === 0;
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
 * Parses a catalog query into title tokens plus structured filters.
 *
 * Operators (case-insensitive, space-separated):
 *   sale / discounted     — currently discounted
 *   free                  — $0
 *   >80  <50              — difficulty range
 *   $10  <$15  >$5        — current price (sale price when discounted)
 */
export function parseQuery(raw: string): SearchFilters {
  const filters: SearchFilters = {
    titleTokens: [],
    onSaleOnly: false,
    freeOnly: false,
  };

  const rewritten = raw
    .trim()
    .toLowerCase()
    .replace(/\bon\s+sale\b/g, "sale")
    .replace(/\bunder\s+\$?/g, "<$")
    .replace(/\$</g, "<$");

  for (const token of rewritten.split(/\s+/).filter(Boolean)) {
    if (token === "sale" || token === "discount" || token === "discounted") {
      filters.onSaleOnly = true;
      continue;
    }
    if (token === "free") {
      filters.freeOnly = true;
      continue;
    }

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

    const priceEq = token.match(/^\$(\d+(?:\.\d+)?)$/);
    if (priceEq) {
      filters.maxPrice = Number(priceEq[1]);
      continue;
    }
    const priceLt = token.match(/^<\$(\d+(?:\.\d+)?)$/);
    if (priceLt) {
      filters.maxPrice = Number(priceLt[1]);
      continue;
    }
    const priceGt = token.match(/^>\$(\d+(?:\.\d+)?)$/);
    if (priceGt) {
      filters.minPrice = Number(priceGt[1]);
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
  if (titleNorm.startsWith(needle)) return 500;
  if (words.some((word) => word === needle)) return 350;
  if (words.some((word) => word.startsWith(needle))) return 250;
  if (titleNorm.includes(needle)) return 120;
  if (needle.length >= 3 && fuzzyIncludes(titleNorm.replace(/ /g, ""), needle.replace(/ /g, ""))) {
    return 40;
  }
  return null;
}

function matchesFilters(game: Game, filters: SearchFilters): boolean {
  if (filters.onSaleOnly && !isOnSale(game)) return false;
  if (filters.freeOnly && !isFree(game)) return false;
  if (filters.minDifficulty !== undefined && game.baseDifficulty < filters.minDifficulty) {
    return false;
  }
  if (filters.maxDifficulty !== undefined && game.baseDifficulty > filters.maxDifficulty) {
    return false;
  }
  const price = currentPrice(game);
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    // Price filters only make sense for games that actually have a price.
    if (price === null) return false;
    if (filters.minPrice !== undefined && price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && price > filters.maxPrice) return false;
  }
  return true;
}

/** Sort helper: games without pricing data go last. */
function priceForSort(game: Game): number {
  return currentPrice(game) ?? Number.POSITIVE_INFINITY;
}

/** Mirrors the API's default order: curated staples, then RAWG popularity. */
function compareFeatured(a: Game, b: Game): number {
  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
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
        // Equally-good text matches fall back to the curated/popularity order.
        return compareFeatured(a.game, b.game);
      case "difficulty":
        return b.game.baseDifficulty - a.game.baseDifficulty;
      case "price":
        return priceForSort(a.game) - priceForSort(b.game);
      case "sale": {
        const aSale = isOnSale(a.game) ? 1 : 0;
        const bSale = isOnSale(b.game) ? 1 : 0;
        if (bSale !== aSale) return bSale - aSale;
        return priceForSort(a.game) - priceForSort(b.game);
      }
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
