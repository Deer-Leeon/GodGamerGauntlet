"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  canManageBoard,
  formatRecordTime,
  getGameRecords,
  getRecordsBoard,
  type GameRecords,
  type RecordRow,
  type RecordsCategory,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProofModal } from "@/components/ProofPlayer";

function formatPlayedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function RecordsPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();

  const [records, setRecords] = useState<GameRecords | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // variableId → selected valueId; absent key means "All".
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [proof, setProof] = useState<RecordRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGameRecords(gameId)
      .then((fetched) => {
        if (cancelled) return;
        setRecords(fetched);
        setCategoryId(fetched.categories[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load records.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const category: RecordsCategory | null = useMemo(
    () => records?.categories.find((c) => c.id === categoryId) ?? null,
    [records, categoryId],
  );

  const subcategoryVariables = useMemo(
    () => category?.variables.filter((v) => v.isSubcategory) ?? [],
    [category],
  );

  const filterIds = useMemo(() => Object.values(filters).sort(), [filters]);

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setBoardLoading(true);
    getRecordsBoard(gameId, categoryId, filterIds)
      .then((fetched) => {
        if (!cancelled) setRows(fetched);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setBoardLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // filterIds is derived; joining keeps the dependency primitive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, categoryId, filterIds.join(",")]);

  function switchCategory(id: string) {
    setCategoryId(id);
    setFilters({});
    setRulesOpen(false);
  }

  function pickValue(variableId: string, valueId: string | null) {
    setFilters((current) => {
      const next = { ...current };
      if (valueId === null) delete next[variableId];
      else next[variableId] = valueId;
      return next;
    });
  }

  if (loadError) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-red-400/90">{loadError}</p>
      </main>
    );
  }

  if (!records) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-faint">Loading records…</p>
      </main>
    );
  }

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div className="flex items-center gap-4">
          {records.thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={records.thumb}
              alt=""
              className="h-16 w-12 border border-gold/20 object-cover"
            />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{records.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Speedrun records
              {records.moderators.length > 0 && (
                <span className="text-faint">
                  {" · moderated by "}
                  {records.moderators.map((mod, index) => (
                    <span key={mod.userId}>
                      {index > 0 && ", "}
                      <Link
                        href={`/u/${encodeURIComponent(mod.username)}`}
                        className="text-muted hover:text-gold"
                      >
                        {mod.username}
                      </Link>
                    </span>
                  ))}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canManageBoard(user, records.moderators) && (
            <Link
              href={`/records/${gameId}/manage`}
              className="border border-gold/30 px-4 py-2 text-sm text-muted transition hover:border-gold hover:text-ink"
            >
              Manage board
            </Link>
          )}
          <Link
            href={`/records/${gameId}/submit`}
            className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
          >
            Submit run
          </Link>
        </div>
      </header>

      {records.categories.length === 0 ? (
        <p className="py-14 text-sm text-faint">
          No categories exist for this game yet.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Category"
            className="mt-8 flex flex-wrap gap-6 border-b border-gold/20 text-sm"
          >
            {records.categories.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={categoryId === item.id}
                onClick={() => switchCategory(item.id)}
                className={`-mb-px border-b-2 pb-3 transition ${
                  categoryId === item.id
                    ? "border-gold text-gold"
                    : "border-transparent text-faint hover:text-ink"
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          {subcategoryVariables.length > 0 && (
            <div className="mt-5 flex flex-col gap-3">
              {subcategoryVariables.map((variable) => (
                <div
                  key={variable.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="mr-1 text-faint">{variable.name}:</span>
                  <FilterPill
                    active={!(variable.id in filters)}
                    label="All"
                    onClick={() => pickValue(variable.id, null)}
                  />
                  {variable.values.map((value) => (
                    <FilterPill
                      key={value.id}
                      active={filters[variable.id] === value.id}
                      label={value.value}
                      onClick={() => pickValue(variable.id, value.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {category?.rules && (
            <div className="mt-5">
              <button
                onClick={() => setRulesOpen((open) => !open)}
                aria-expanded={rulesOpen}
                className="text-sm text-faint transition hover:text-gold"
              >
                {rulesOpen ? "▾" : "▸"} Rules — {category.name}
              </button>
              {rulesOpen && (
                <div className="mt-3 whitespace-pre-wrap border border-gold/20 bg-black/20 p-4 text-sm leading-relaxed text-muted">
                  {category.rules}
                </div>
              )}
            </div>
          )}

          <BoardTable
            loading={boardLoading}
            rows={rows}
            onProof={setProof}
          />
        </>
      )}

      {proof && (
        <ProofModal
          videoUrl={proof.videoUrl}
          label={`${proof.playerName} — ${formatRecordTime(proof.primaryTimeMs)}`}
          onClose={() => setProof(null)}
        />
      )}
    </main>
  );
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`border px-3 py-1 transition ${
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-gold/20 text-muted hover:border-gold/50 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

const GRID =
  "grid grid-cols-[3rem_1fr_7rem_6rem] gap-3 sm:grid-cols-[3rem_1fr_8rem_1fr_7rem_4rem]";

function BoardTable({
  loading,
  rows,
  onProof,
}: {
  loading: boolean;
  rows: RecordRow[];
  onProof: (row: RecordRow) => void;
}) {
  return (
    <div className="feed-list mt-6">
      <div
        className={`feed-head ${GRID} border-b border-gold/20 py-3.5 text-sm text-faint`}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Time</span>
        <span className="hidden sm:block">Tags</span>
        <span className="hidden text-right sm:block">Played</span>
        <span className="text-center">Proof</span>
      </div>

      {loading && <p className="py-14 text-sm text-faint">Loading board…</p>}

      {!loading && rows.length === 0 && (
        <p className="py-14 text-sm text-faint">
          No verified runs on this board yet. Claim the top spot.
        </p>
      )}

      <ol>
        {rows.map((row) => (
          <li key={row.submissionId} className="feed-row">
            <div className={`${GRID} items-center py-3.5 text-sm`}>
              <span
                className={`font-mono tabular-nums ${
                  row.rank === 1 ? "text-gold" : "text-muted"
                }`}
              >
                {row.rank === 1 ? "🏆 1" : row.rank}
              </span>
              <Link
                href={`/u/${encodeURIComponent(row.playerName)}`}
                className="truncate font-medium text-ink hover:text-gold"
              >
                {row.playerName}
              </Link>
              <span className="text-right font-mono tabular-nums text-ink">
                {formatRecordTime(row.primaryTimeMs)}
              </span>
              <span className="hidden flex-wrap gap-1.5 sm:flex">
                {row.variables.map((tag) => (
                  <span
                    key={tag.variableValueId}
                    title={`${tag.variableName}: ${tag.value}`}
                    className="border border-gold/20 px-1.5 py-0.5 text-[11px] text-faint"
                  >
                    {tag.value}
                  </span>
                ))}
                {row.isEmulator && (
                  <span className="border border-gold/20 px-1.5 py-0.5 text-[11px] text-faint">
                    EMU
                  </span>
                )}
              </span>
              <span className="hidden text-right font-mono text-xs text-muted sm:block">
                {formatPlayedOn(row.playedOn)}
              </span>
              <span className="text-center">
                <button
                  onClick={() => onProof(row)}
                  title={`Watch ${row.playerName}'s run${
                    row.examinerName
                      ? ` — verified by ${row.examinerName}`
                      : ""
                  }`}
                  aria-label={`Watch proof video for ${row.playerName}`}
                  className="text-faint transition hover:text-gold"
                >
                  ▶
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
