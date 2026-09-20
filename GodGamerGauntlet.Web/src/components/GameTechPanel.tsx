"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getGameTech,
  reportGameTech,
  voteOnGameTech,
  type GameTechCard,
  type GameTechKind,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProofPlayer } from "@/components/ProofPlayer";

const KIND_ORDER: GameTechKind[] = [
  "Skip",
  "Movement",
  "Boss",
  "Glitch",
  "OutOfBounds",
  "Route",
];

const KIND_LABEL: Record<GameTechKind, string> = {
  Skip: "Skip",
  Movement: "Movement",
  Boss: "Boss",
  Glitch: "Glitch",
  OutOfBounds: "Out of bounds",
  Route: "Route",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  Easy: "Easy",
  Medium: "Medium",
  Hard: "Hard",
  FrameTight: "Frame-tight",
};

export function GameTechPanel({ gameId }: { gameId: string }) {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const loginHref = `/login?next=${encodeURIComponent(`/records/${gameId}#tech`)}`;

  const [items, setItems] = useState<GameTechCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<GameTechKind | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    setKind("all");
    getGameTech(gameId)
      .then((fetched) => {
        if (!cancelled) setItems(fetched);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Failed to load tech.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const kindsPresent = useMemo(() => {
    if (!items) return [];
    const have = new Set(items.map((item) => item.kind));
    return KIND_ORDER.filter((k) => have.has(k));
  }, [items]);

  const visible = useMemo(() => {
    if (!items) return [];
    if (kind === "all") return items;
    return items.filter((item) => item.kind === kind);
  }, [items, kind]);

  function patchCard(id: string, patch: Partial<GameTechCard>) {
    setItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ??
      current,
    );
  }

  if (error) {
    return <p className="py-14 text-sm text-red-400/90">{error}</p>;
  }

  if (!items) {
    return <p className="py-14 text-sm text-faint">Loading tech…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-14 text-sm text-faint">
        No tech published for this game yet.
      </p>
    );
  }

  return (
    <div id="tech" className="mt-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 text-faint">Kind:</span>
        <FilterPill
          active={kind === "all"}
          label="All"
          onClick={() => setKind("all")}
        />
        {kindsPresent.map((k) => (
          <FilterPill
            key={k}
            active={kind === k}
            label={KIND_LABEL[k]}
            onClick={() => setKind(k)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-14 text-sm text-faint">
          No {kind === "all" ? "" : `${KIND_LABEL[kind]} `}tech published for
          this game yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {visible.map((card) => (
            <li key={card.id}>
              <TechCard
                gameId={gameId}
                card={card}
                signedIn={signedIn}
                loginHref={loginHref}
                onPatch={(patch) => patchCard(card.id, patch)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TechCard({
  gameId,
  card,
  signedIn,
  loginHref,
  onPatch,
}: {
  gameId: string;
  card: GameTechCard;
  signedIn: boolean;
  loginHref: string;
  onPatch: (patch: Partial<GameTechCard>) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const clip = card.clips[0];

  async function castVote(direction: 1 | -1) {
    if (!signedIn) return;
    const next = card.myVote === direction ? 0 : direction;
    onPatch({ myVote: next, score: card.score - card.myVote + next });
    try {
      const result = await voteOnGameTech(gameId, card.id, next);
      onPatch({ score: result.voteScore, myVote: result.myVote });
    } catch {
      onPatch({ score: card.score, myVote: card.myVote });
    }
  }

  async function reportPatched() {
    if (!signedIn || reporting || reported) return;
    setReporting(true);
    setReportError(null);
    try {
      await reportGameTech(gameId, card.id, "Patched");
      setReported(true);
    } catch (caught: unknown) {
      setReportError(
        caught instanceof Error ? caught.message : "Could not send report.",
      );
    } finally {
      setReporting(false);
    }
  }

  return (
    <article className="border border-gold/20 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{card.title}</h2>
            <span className="border border-gold/20 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-faint">
              {KIND_LABEL[card.kind] ?? card.kind}
            </span>
            <span className="border border-gold/20 px-1.5 py-0.5 text-[11px] text-faint">
              {DIFFICULTY_LABEL[card.difficulty] ?? card.difficulty}
            </span>
            {card.status === "Patched" && (
              <span className="border border-red-400/40 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-red-400/90">
                Patched
              </span>
            )}
            {card.status === "Disputed" && (
              <span className="border border-gold/40 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-gold">
                Disputed
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">{card.summary}</p>
          {(card.prerequisites || card.loadout || card.versionNote) && (
            <p className="mt-2 text-xs text-faint">
              {card.prerequisites && <>Needs {card.prerequisites}</>}
              {card.prerequisites && (card.loadout || card.versionNote) && " · "}
              {card.loadout}
              {card.loadout && card.versionNote && " · "}
              {card.versionNote && (
                <span>
                  {card.patchScope === "Patched" ? "Patched" : "Version"}:{" "}
                  {card.versionNote}
                </span>
              )}
            </p>
          )}
        </div>
        <VoteColumn
          score={card.score}
          myVote={card.myVote}
          signedIn={signedIn}
          onVote={castVote}
        />
      </div>

      {card.bodyMarkdown && (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {card.bodyMarkdown}
        </p>
      )}

      {clip && (
        <div className="mt-4">
          <ProofPlayer videoUrl={clip.url} startSeconds={clip.startSeconds} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {signedIn ? (
          <button
            type="button"
            onClick={reportPatched}
            disabled={reporting || reported}
            className="text-faint transition hover:text-gold disabled:cursor-default disabled:opacity-70"
          >
            {reported
              ? "Report sent"
              : reporting
                ? "Sending…"
                : "This is patched"}
          </button>
        ) : (
          <Link href={loginHref} className="text-faint hover:text-gold">
            Sign in to vote or report a patched trick
          </Link>
        )}
        {reportError && <span className="text-red-400/90">{reportError}</span>}
      </div>
    </article>
  );
}

function VoteColumn({
  score,
  myVote,
  signedIn,
  onVote,
}: {
  score: number;
  myVote: number;
  signedIn: boolean;
  onVote: (direction: 1 | -1) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5">
      <button
        type="button"
        aria-label="Upvote"
        disabled={!signedIn}
        onClick={() => onVote(1)}
        className={`px-1 text-sm transition disabled:cursor-not-allowed ${
          myVote === 1 ? "text-gold" : "text-faint hover:text-ink disabled:hover:text-faint"
        }`}
      >
        ▲
      </button>
      <span
        className={`text-sm font-medium tabular-nums ${
          score > 0 ? "text-gold" : score < 0 ? "text-red-400/90" : "text-muted"
        }`}
      >
        {score}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        disabled={!signedIn}
        onClick={() => onVote(-1)}
        className={`px-1 text-sm transition disabled:cursor-not-allowed ${
          myVote === -1
            ? "text-gold"
            : "text-faint hover:text-ink disabled:hover:text-faint"
        }`}
      >
        ▼
      </button>
    </div>
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
      type="button"
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
