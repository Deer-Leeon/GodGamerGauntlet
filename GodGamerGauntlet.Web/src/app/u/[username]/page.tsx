"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getProfile, type ProfileMode, type ProfileRun, type RunType, type UserProfile } from "@/lib/api";
import { timeAgo } from "@/components/RunSocial";

type HistoryFilter = "All" | RunType;

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function clearRate(clears: number, attempts: number): string {
  if (attempts === 0) return "—";
  return `${Math.round((clears / attempts) * 100)}%`;
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const decoded = decodeURIComponent(username ?? "");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setHistoryFilter("All");
    getProfile(decoded)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile(null);
          setMissing(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  const history = useMemo(() => {
    if (!profile) return [];
    if (historyFilter === "All") return profile.runs;
    return profile.runs.filter((run) => run.runType === historyFilter);
  }, [profile, historyFilter]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (missing || !profile) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Player not found</h1>
        <Link
          href="/players"
          className="mt-6 inline-block border border-gold/30 px-4 py-2 text-sm text-gold"
        >
          Browse players
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-8">
      <p className="mb-4 text-sm text-faint">
        <Link href="/players" className="hover:text-gold">
          Players
        </Link>
      </p>

      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">{profile.username}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Joined {formatJoined(profile.createdAt)}
          {profile.lastRunAt
            ? ` · Last run ${timeAgo(profile.lastRunAt)}`
            : " · No finished gauntlets yet"}
        </p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">
        <Stat label="Attempts" value={String(profile.attemptCount)} />
        <Stat label="Clears" value={String(profile.clearCount)} />
        <Stat label="DNFs" value={String(profile.dnfCount)} />
        <Stat
          label="Clear rate"
          value={clearRate(profile.clearCount, profile.attemptCount)}
        />
        <Stat label="Games beaten" value={String(profile.gamesBeaten)} />
      </section>

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <ModeCard label="Standard" mode={profile.standard} />
        <ModeCard label="Lite" mode={profile.lite} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-ink">Gauntlet history</h2>
        <div
          role="tablist"
          aria-label="Filter history"
          className="mt-4 flex gap-6 border-b border-gold/20 text-sm"
        >
          {(["All", "Standard", "Lite"] as const).map((filter) => (
            <button
              key={filter}
              role="tab"
              aria-selected={historyFilter === filter}
              onClick={() => setHistoryFilter(filter)}
              className={`-mb-px border-b-2 pb-3 transition ${
                historyFilter === filter
                  ? "border-gold text-gold"
                  : "border-transparent text-faint hover:text-ink"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {history.length === 0 ? (
          <p className="mt-5 text-sm text-faint">
            {profile.runs.length === 0
              ? "No finished gauntlets yet."
              : `No ${historyFilter.toLowerCase()} gauntlets yet.`}
          </p>
        ) : (
          <div className="feed-list mt-5">
            <ol>
              {history.map((run) => (
                <HistoryRow key={run.runId} run={run} />
              ))}
            </ol>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-faint">{label}</p>
      <p className="mt-1 font-mono text-lg tabular-nums text-ink">{value}</p>
    </div>
  );
}

function ModeCard({ label, mode }: { label: string; mode: ProfileMode }) {
  const board = mode.personalBest;
  return (
    <div className="border-t border-gold/20 pt-4">
      <p className="text-sm text-faint">{label}</p>
      {board ? (
        <p className="mt-2">
          <Link
            href={`/run/${board.runId}`}
            className="font-mono text-xl tabular-nums text-gold"
          >
            #{board.rank}
          </Link>
          <span className="ml-2 text-sm text-muted">
            of {board.boardSize}
            {" · "}
            {formatScore(board.score)}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-faint">No Clear yet.</p>
      )}
      <p className="mt-2 text-sm text-faint">
        {mode.attempts === 0
          ? "No attempts."
          : `${mode.attempts} attempt${mode.attempts === 1 ? "" : "s"} · ${mode.clears} Clear${mode.clears === 1 ? "" : "s"} · furthest ${mode.bestSurvival}/${mode.bestSurvivalTotal}`}
      </p>
    </div>
  );
}

function HistoryRow({ run }: { run: ProfileRun }) {
  const clear = run.status === "Completed";
  return (
    <li className="feed-row flex items-baseline gap-3 py-3.5 text-sm">
      <span className={`w-12 shrink-0 ${clear ? "text-gold" : "text-red-400/80"}`}>
        {clear ? "Clear" : "DNF"}
      </span>
      <Link
        href={`/run/${run.runId}`}
        className="min-w-0 flex-1 truncate text-ink hover:text-gold"
      >
        {run.runType}
        {run.boardRank != null
          ? ` · #${run.boardRank}`
          : run.wouldBeRank != null
            ? ` · would #${run.wouldBeRank}`
            : ""}
        {` · ${run.slotsCompleted}/${run.totalSlots}`}
      </Link>
      <span className="shrink-0 font-mono tabular-nums text-faint">
        {formatScore(run.totalScore)}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-sm text-faint sm:block">
        {timeAgo(run.endTime)}
      </span>
    </li>
  );
}
