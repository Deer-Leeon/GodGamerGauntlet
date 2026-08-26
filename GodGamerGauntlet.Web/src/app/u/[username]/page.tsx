"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getProfile, type UserProfile } from "@/lib/api";
import { timeAgo } from "@/components/RunSocial";

function formatScore(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const decoded = decodeURIComponent(username ?? "");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
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
          href="/"
          className="mt-6 inline-block border border-gold/30 px-4 py-2 text-sm text-gold"
        >
          Back to feed
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 sm:px-8">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">{profile.username}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {profile.clearCount} Clear{profile.clearCount === 1 ? "" : "s"} ·{" "}
          {profile.dnfCount} DNF
        </p>
      </header>

      <section className="mt-8 grid gap-8 sm:grid-cols-2">
        <PbCard label="Standard" board={profile.standard} />
        <PbCard label="Lite" board={profile.lite} />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium text-ink">Recent attempts</h2>
        {profile.recentRuns.length === 0 ? (
          <p className="text-sm text-faint">No finished gauntlets yet.</p>
        ) : (
          <ol className="feed-list">
            {profile.recentRuns.map((run) => {
              const clear = run.status === "Completed";
              return (
                <li key={run.runId} className="feed-row flex items-baseline gap-3 py-3.5 text-sm">
                  <span
                    className={`w-12 shrink-0 ${clear ? "text-gold" : "text-red-400/80"}`}
                  >
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
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

function PbCard({
  label,
  board,
}: {
  label: string;
  board: UserProfile["standard"];
}) {
  return (
    <div className="border-t border-gold/20 pt-4">
      <p className="text-sm text-faint">{label}</p>
      {board ? (
        <p className="mt-2">
          <Link href={`/run/${board.runId}`} className="font-mono text-xl tabular-nums text-gold">
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
    </div>
  );
}
