"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatRecordTime,
  getModQueue,
  reviewSubmission,
  type ModQueueItem,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProofPlayer } from "@/components/ProofPlayer";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ModQueuePage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<ModQueueItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    getModQueue()
      .then((fetched) => {
        if (!cancelled) setItems(fetched);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load queue.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  async function review(
    item: ModQueueItem,
    action: "Verify" | "Reject",
    rejectReason?: string,
  ) {
    // Optimistic: pull the card immediately, restore it if the API refuses.
    setActionError(null);
    setItems((current) =>
      (current ?? []).filter((x) => x.submissionId !== item.submissionId),
    );
    try {
      await reviewSubmission(item.submissionId, action, rejectReason);
    } catch (error: unknown) {
      setItems((current) => {
        const restored = [...(current ?? []), item];
        restored.sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        );
        return restored;
      });
      setActionError(
        error instanceof Error ? error.message : "Review failed.",
      );
    }
  }

  if (authLoading) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-faint">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <h1 className="text-2xl font-semibold">Verification queue</h1>
        <p className="mt-4 text-sm text-muted">
          Sign in with a moderator account to review pending runs.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">Verification queue</h1>
        <p className="mt-2 text-sm text-muted">
          Pending runs for games you moderate, oldest first. Watch the proof,
          then verify or reject.
        </p>
      </header>

      {loadError && <p className="py-6 text-sm text-red-400/90">{loadError}</p>}
      {actionError && (
        <p className="mt-4 border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm text-red-400/90">
          {actionError}
        </p>
      )}

      {items === null && !loadError && (
        <p className="py-14 text-sm text-faint">Loading queue…</p>
      )}

      {items !== null && items.length === 0 && (
        <p className="py-14 text-sm text-faint">
          The docket is clear. Nothing awaits review in games you moderate.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {(items ?? []).map((item) => (
          <QueueCard key={item.submissionId} item={item} onReview={review} />
        ))}
      </div>
    </main>
  );
}

function QueueCard({
  item,
  onReview,
}: {
  item: ModQueueItem;
  onReview: (
    item: ModQueueItem,
    action: "Verify" | "Reject",
    rejectReason?: string,
  ) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [showVideo, setShowVideo] = useState(false);

  return (
    <article className="border border-gold/20 bg-black/20">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gold/10 p-4">
        <div className="min-w-0">
          <p className="text-sm text-faint">
            {item.gameTitle} · {item.categoryName}
          </p>
          <p className="mt-1 truncate">
            <Link
              href={`/u/${encodeURIComponent(item.playerName)}`}
              className="font-medium text-ink hover:text-gold"
            >
              {item.playerName}
            </Link>
            <span className="ml-2 font-mono text-lg tabular-nums text-gold">
              {formatRecordTime(item.primaryTimeMs)}
            </span>
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {item.variables.map((tag) => (
              <span
                key={tag.variableValueId}
                className="border border-gold/20 px-1.5 py-0.5 text-faint"
              >
                {tag.variableName}: {tag.value}
              </span>
            ))}
            {item.isEmulator && (
              <span className="border border-gold/20 px-1.5 py-0.5 text-faint">
                EMU
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-faint">
            Played {formatWhen(item.playedOn)} · submitted{" "}
            {formatWhen(item.submittedAt)} · player since{" "}
            {formatWhen(item.playerJoined)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => onReview(item, "Verify")}
            className="border border-emerald-500/60 px-4 py-2 text-sm text-emerald-400 transition hover:bg-emerald-500/10"
          >
            Verify
          </button>
          <button
            onClick={() => setRejecting((open) => !open)}
            aria-expanded={rejecting}
            className="border border-red-500/60 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            Reject
          </button>
        </div>
      </div>

      {rejecting && (
        <div className="flex flex-wrap items-center gap-3 border-b border-gold/10 bg-red-500/5 p-4">
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && reason.trim()) {
                onReview(item, "Reject", reason.trim());
              }
            }}
            placeholder="Reason the runner will see — required"
            autoFocus
            className="min-w-64 flex-1 border border-red-400/40 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-red-400 focus:outline-none"
          />
          <button
            onClick={() => onReview(item, "Reject", reason.trim())}
            disabled={!reason.trim()}
            className="bg-red-500/80 px-4 py-2 text-sm text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm rejection
          </button>
          <button
            onClick={() => setRejecting(false)}
            className="text-sm text-faint hover:text-ink"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="p-4">
        {showVideo ? (
          <ProofPlayer videoUrl={item.videoUrl} />
        ) : (
          <button
            onClick={() => setShowVideo(true)}
            className="flex aspect-video w-full items-center justify-center border border-dashed border-gold/20 text-sm text-faint transition hover:border-gold/50 hover:text-gold"
          >
            ▶ Load proof video
          </button>
        )}
        <a
          href={item.videoUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-faint hover:text-gold"
        >
          Open proof in new tab ↗
        </a>
      </div>
    </article>
  );
}
