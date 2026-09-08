"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCatalog, type CatalogPage } from "@/lib/api";

const PAGE_SIZE = 40;
const DEBOUNCE_MS = 300;

export default function RecordsDirectoryPage() {
  const [searchText, setSearchText] = useState("");
  // The query actually sent to the API, updated after the debounce settles.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<CatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(searchText);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCatalog(query, page, PAGE_SIZE)
      .then((fetched) => {
        if (cancelled) return;
        setResult(fetched);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load games.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">Speedrun records</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Every game in the gauntlet roster keeps a board here. Pick one to see
          its verified times, category rules, and record history — or submit a
          run of your own.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <input
          ref={searchRef}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search the roster…"
          aria-label="Search games"
          className="w-full max-w-md border border-gold/30 bg-transparent px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
        />
        {result && !loading && (
          <p className="text-sm text-faint">
            {result.totalCount.toLocaleString("en-US")}{" "}
            {result.totalCount === 1 ? "game" : "games"}
            {query.trim() && <> matching &ldquo;{query.trim()}&rdquo;</>}
          </p>
        )}
      </div>

      {loadError && (
        <p className="py-10 text-sm text-red-400/90">{loadError}</p>
      )}

      {loading && !result && (
        <p className="py-14 text-sm text-faint">Loading catalog…</p>
      )}

      {result && result.items.length === 0 && !loading && (
        <p className="py-14 text-sm text-faint">
          Nothing matches that search.
        </p>
      )}

      {result && result.items.length > 0 && (
        <ul
          className={`mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5 ${
            loading ? "opacity-50" : ""
          }`}
        >
          {result.items.map((game) => (
            <li key={game.id}>
              <Link
                href={`/records/${game.id}`}
                className="group block border border-gold/15 bg-black/20 transition hover:border-gold/50"
              >
                {game.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.thumb}
                    alt=""
                    loading="lazy"
                    className="aspect-4/3 w-full object-cover opacity-90 transition group-hover:opacity-100"
                  />
                ) : (
                  <div className="flex aspect-4/3 w-full items-center justify-center bg-black/40 text-2xl text-faint">
                    {game.title.charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="truncate px-3 py-2.5 text-sm text-ink transition group-hover:text-gold">
                  {game.title}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result && result.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-6 text-sm">
          <button
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={result.currentPage <= 1 || loading}
            className="border border-gold/30 px-4 py-2 text-muted transition hover:border-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="font-mono tabular-nums text-faint">
            Page {result.currentPage} of {result.totalPages}
          </span>
          <button
            onClick={() =>
              setPage((current) => Math.min(current + 1, result.totalPages))
            }
            disabled={result.currentPage >= result.totalPages || loading}
            className="border border-gold/30 px-4 py-2 text-muted transition hover:border-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
