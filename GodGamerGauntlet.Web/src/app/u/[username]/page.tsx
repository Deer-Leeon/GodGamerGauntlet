"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getProfile, type ProfileGame, type ProfileLiveRun, type ProfileMode, type ProfileRun, type RunType, type UserProfile } from "@/lib/api";
import { timeAgo } from "@/components/RunSocial";
import { formatSpeedrunTime } from "@/components/SpeedrunTimer";
import MomentChips from "@/components/MomentChips";
import SurvivalMeter from "@/components/SurvivalMeter";
import { StreamLinkList } from "@/components/StreamLinks";

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
      <main className="site-content flex-1 px-6 py-10">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (missing || !profile) {
    return (
      <main className="site-content flex-1 px-6 py-16 text-center">
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
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <p className="mb-4 text-sm text-faint">
        <Link href="/players" className="hover:text-gold">
          Players
        </Link>
      </p>

      <header className="border-b border-gold/20 pb-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold">{profile.username}</h1>
          {profile.live && <span className="live-run-chip">Live</span>}
        </div>
        {profile.title && (
          <p className="mt-1 text-sm font-medium text-gold">{profile.title}</p>
        )}
        {(profile.titles ?? []).length > 1 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {profile.titles.map((earned) => (
              <li
                key={earned}
                className={`border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  earned === profile.title
                    ? "border-gold text-gold"
                    : "border-gold/25 text-faint"
                }`}
              >
                {earned}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Joined {formatJoined(profile.createdAt)}
          {profile.live
            ? " · Live now"
            : profile.lastRunAt
              ? ` · Last run ${timeAgo(profile.lastRunAt)}`
              : " · No finished gauntlets yet"}
        </p>
        <StreamLinkList links={profile.streamLinks} />
      </header>

      {profile.live && <LiveRunCallout live={profile.live} />}

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

      <Bestiary beaten={profile.beaten ?? []} killers={profile.killers ?? []} />

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
            {history.map((run) => (
              <HistoryCard key={run.runId} run={run} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function LiveRunCallout({ live }: { live: ProfileLiveRun }) {
  const isLite = live.runType === "Lite";
  const title = live.currentTitle ?? "the next game";

  return (
    <Link href={`/run/${live.runId}`} className="live-run-banner">
      <span className="live-run-kicker">
        <span className="live-run-dot" aria-hidden />
        Live run
      </span>
      {live.currentThumb ? (
        <span className="live-run-thumb">
          <Image
            src={live.currentThumb}
            alt=""
            fill
            unoptimized
            sizes="48px"
            className="object-cover"
          />
        </span>
      ) : null}
      <span className="live-run-copy">
        <span className="live-run-title">
          On game {live.currentSlot} of {live.totalSlots}
          {isLite ? " · Lite" : ""}
        </span>
        <span className="live-run-game">{title}</span>
      </span>
      <span className="live-run-cta">Open the gauntlet</span>
    </Link>
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
      {board?.nextRank != null && (board.pointsToNext ?? 0) > 0 && (
        <p className="mt-1 text-sm text-faint">
          {formatScore(board.pointsToNext ?? 0)} behind #{board.nextRank}
          {board.nextUsername ? ` · ${board.nextUsername}` : ""}
        </p>
      )}
      {board?.rank === 1 && (
        <p className="mt-1 text-sm text-gold">Holds 1st</p>
      )}
      <div className="mt-4">
        <SurvivalMeter
          label="Furthest"
          survived={mode.bestSurvival}
          total={mode.bestSurvivalTotal}
        />
      </div>
      <p className="mt-2 text-sm text-faint">
        {mode.attempts === 0
          ? "No attempts."
          : `${mode.attempts} attempt${mode.attempts === 1 ? "" : "s"} · ${mode.clears} Clear${mode.clears === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

function Bestiary({
  beaten,
  killers,
}: {
  beaten: ProfileGame[];
  killers: ProfileGame[];
}) {
  if (beaten.length === 0 && killers.length === 0) return null;
  return (
    <section className="mt-10 grid gap-8 sm:grid-cols-2">
      <GameShelf
        label="Beaten"
        empty="No games beaten yet."
        games={beaten}
      />
      <GameShelf
        label="Ended runs"
        empty="No run-ending games yet."
        games={killers}
        danger
      />
    </section>
  );
}

function GameShelf({
  label,
  empty,
  games,
  danger = false,
}: {
  label: string;
  empty: string;
  games: ProfileGame[];
  danger?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-ink">{label}</h2>
      {games.length === 0 ? (
        <p className="text-sm text-faint">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {games.map((game) => (
            <li
              key={game.gameId}
              title={`${game.title} ×${game.count}`}
              className="relative h-10 w-10 overflow-hidden bg-white/5"
            >
              {game.thumb ? (
                <Image
                  src={game.thumb}
                  alt=""
                  fill
                  unoptimized
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center font-mono text-[10px] text-faint">
                  {game.title.slice(0, 1)}
                </span>
              )}
              {danger && (
                <span aria-hidden className="absolute inset-0 bg-red-950/45" />
              )}
              {game.count > 1 && (
                <span className="absolute bottom-0 right-0 bg-black/70 px-0.5 font-mono text-[9px] text-ink">
                  {game.count}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryCard({ run }: { run: ProfileRun }) {
  const clear = run.status === "Completed";
  const isLite = run.runType === "Lite";
  const elapsedMs = run.elapsedMs > 0 ? run.elapsedMs : null;
  const statuses = run.slotStatuses ?? [];
  const titles = run.slotTitles ?? [];
  const thumbs = run.slotThumbs ?? [];

  return (
    <article className="feed-row py-4">
      <Link href={`/run/${run.runId}`} className="block outline-none">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className={clear ? "text-gold" : "text-red-400/80"}>
            {clear ? "Clear" : "DNF"}
          </span>
          {clear && run.boardRank != null && (
            <>
              <span className="text-faint/70">·</span>
              <span className="font-mono tabular-nums text-gold">
                #{run.boardRank}
              </span>
            </>
          )}
          {clear && run.boardRank == null && run.wouldBeRank != null && (
            <>
              <span className="text-faint/70">·</span>
              <span className="tabular-nums text-faint">
                would #{run.wouldBeRank}
              </span>
            </>
          )}
          {isLite && (
            <>
              <span className="text-faint/70">·</span>
              <span className="text-faint">Lite</span>
            </>
          )}
          <span className="text-faint/70">·</span>
          <span className="text-faint">{timeAgo(run.endTime)}</span>
        </div>

        {(run.moments ?? []).length > 0 && (
          <div className="mt-2">
            <MomentChips moments={run.moments} />
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-sm leading-snug text-ink">
            {clear
              ? `${run.totalSlots}/${run.totalSlots} games`
              : `Stopped on game ${run.slotsCompleted + 1} of ${run.totalSlots}`}
          </p>
          <p className="font-mono text-sm tabular-nums text-faint">
            {elapsedMs !== null && (
              <>
                <span>{formatSpeedrunTime(elapsedMs)}</span>
                <span className="mx-2 text-faint/50">·</span>
              </>
            )}
            <span>{formatScore(run.totalScore)}</span>
          </p>
        </div>

        {statuses.length > 0 && (
          <ol className="mt-3 flex flex-wrap gap-0.5">
            {statuses.map((status, i) => {
              const thumb = thumbs[i] ?? null;
              const title = titles[i] ?? `Slot ${i + 1}`;
              return (
                <li
                  key={i}
                  title={`${i + 1}. ${title} — ${status}`}
                  className={`relative h-8 w-8 overflow-hidden bg-white/5 ${
                    status === "Pending" ? "opacity-40" : ""
                  } ${status === "Lost" ? "opacity-80" : ""}`}
                >
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      unoptimized
                      sizes="32px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-mono text-[10px] text-faint">
                      {i + 1}
                    </span>
                  )}
                  {status === "Lost" && (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-red-950/45"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Link>
    </article>
  );
}
