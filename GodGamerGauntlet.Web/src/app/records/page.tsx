"use client";

import { useEffect, useRef, useState } from "react";
import { getCatalog, type CatalogPage } from "@/lib/api";
import { RosterDisclaimer } from "@/components/RosterDisclaimer";
import RosterGrid from "@/components/RosterGrid";

const PAGE_SIZE = 40;
const DEBOUNCE_MS = 300;

export default function RecordsDirectoryPage() {
  const [searchText, setSearchText] = useState("");
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
      <header className="border-b-2 border-ink/15 pb-6">
        <p className="font-pixel text-[10px] leading-6 text-banner">ROSTER</p>
        <h1 className="mt-2 text-2xl font-semibold">Games</h1>
        <div className="mt-3 h-1.5 w-20 bg-banner" />
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          These 19 games are the whole catalog — what you draft, and the only
          boards we would import from speedrun.com. Times here are
          Gauntlet-verified VODs or attributed imports; every imported row
          links out.
        </p>
        <RosterDisclaimer />
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <input
          ref={searchRef}
          type="search"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search games…"
          aria-label="Search games"
          className="w-full max-w-md border-2 border-ink/15 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-banner focus:outline-none"
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
        <p className="py-14 text-sm text-faint">Loading roster…</p>
      )}

      {result && result.items.length === 0 && !loading && (
        <p className="py-14 text-sm text-faint">
          Nothing matches that search.
        </p>
      )}

      {result && result.items.length > 0 && (
          <div className={`mt-6 ${loading ? "opacity-50" : ""}`}>
            <RosterGrid games={result.items} />
          </div>
      )}

      {result && result.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-6 text-sm">
          <button
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            disabled={result.currentPage <= 1 || loading}
            className="border border-ink/15 px-4 py-2 text-muted transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
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
            className="border border-ink/15 px-4 py-2 text-muted transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
