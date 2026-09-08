"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  formatRecordTime,
  getMyPendingRuns,
  getProfile,
  getUserSpeedruns,
  type ProfileGame,
  type ProfileLiveRun,
  type ProfileMode,
  type ProfileRun,
  type RunType,
  type Submission,
  type UserProfile,
} from "@/lib/api";
import { timeAgo } from "@/components/RunSocial";
import SpeedrunTimer, { formatSpeedrunTime } from "@/components/SpeedrunTimer";
import MomentChips from "@/components/MomentChips";
import SurvivalMeter from "@/components/SurvivalMeter";
import { StreamLinkList } from "@/components/StreamLinks";
import { useOverlayRun } from "@/lib/useOverlayRun";
import FollowButton from "@/components/FollowButton";
import { useAuth } from "@/lib/auth";

type HistoryFilter = "All" | RunType;
type ProfileTab = "speedruns" | "gauntlets" | "courtroom";

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
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("All");
  const [speedruns, setSpeedruns] = useState<Submission[] | null>(null);
  const [courtroomRuns, setCourtroomRuns] = useState<Submission[] | null>(null);
  const [pickedTab, setPickedTab] = useState<ProfileTab | null>(null);

  const isOwner = user != null && profile != null && user.id === profile.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    setHistoryFilter("All");
    setSpeedruns(null);
    setCourtroomRuns(null);
    setPickedTab(null);
    Promise.all([
      getProfile(decoded),
      getUserSpeedruns(decoded).catch(() => [] as Submission[]),
    ])
      .then(([data, runs]) => {
        if (cancelled) return;
        setProfile(data);
        setSpeedruns(runs);
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

  // The courtroom tab is the owner's private view of pending/rejected runs.
  useEffect(() => {
    if (!isOwner) {
      setCourtroomRuns(null);
      return;
    }
    let cancelled = false;
    getMyPendingRuns()
      .then((runs) => {
        if (!cancelled) setCourtroomRuns(runs);
      })
      .catch(() => {
        if (!cancelled) setCourtroomRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  // Notifications deep-link to the courtroom via ?tab=pending. Read from
  // window instead of useSearchParams to avoid a Suspense boundary.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "pending" || wanted === "courtroom") {
      setPickedTab("courtroom");
    } else if (wanted === "speedruns" || wanted === "gauntlets") {
      setPickedTab(wanted);
    }
  }, [decoded]);

  // Default to the trophy room when it has trophies, otherwise gauntlets.
  // The courtroom is owner-only, so visitors deep-linking there fall back.
  const fallbackTab: ProfileTab =
    (speedruns?.length ?? 0) > 0 ? "speedruns" : "gauntlets";
  const tab: ProfileTab =
    pickedTab === null || (pickedTab === "courtroom" && !isOwner)
      ? fallbackTab
      : pickedTab;

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {profile.avatarUrl && (
            // Free-form external URL — next/image would need domain allowlisting.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="h-12 w-12 rounded-full border border-gold/25 object-cover"
            />
          )}
          <h1 className="text-2xl font-semibold">
            {profile.displayName ?? profile.username}
          </h1>
          {profile.displayName &&
            profile.displayName !== profile.username && (
              <span className="text-sm text-faint">@{profile.username}</span>
            )}
          {profile.isReserved && (
            <span className="border border-gold/30 px-2 py-0.5 text-[11px] uppercase tracking-wide text-gold">
              Unclaimed
            </span>
          )}
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
        {profile.isReserved && (
          <div className="mt-4 max-w-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm leading-relaxed text-muted">
            Unclaimed record holder. This profile is a placeholder for a
            speedrun.com runner until they prove they own that account.
            {user ? (
              <>
                {" "}
                <Link href="/settings#src-claim" className="text-gold hover:underline">
                  Claim it in Settings
                </Link>{" "}
                with your speedrun.com API key.
              </>
            ) : (
              <>
                {" "}
                <Link href="/login" className="text-gold hover:underline">
                  Sign in
                </Link>{" "}
                to claim this name.
              </>
            )}
          </div>
        )}
        {user?.id !== profile.id && !profile.isReserved && (
          <div className="mt-4">
            <FollowButton
              username={profile.username}
              following={!!profile.isFollowing}
              onChange={(following) =>
                setProfile((current) =>
                  current ? { ...current, isFollowing: following } : current,
                )
              }
            />
          </div>
        )}
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

      <div
        role="tablist"
        aria-label="Profile sections"
        className="mt-10 flex flex-wrap gap-6 border-b border-gold/20 text-sm"
      >
        <ProfileTabButton
          active={tab === "speedruns"}
          onClick={() => setPickedTab("speedruns")}
          label={`Speedruns${speedruns?.length ? ` (${speedruns.length})` : ""}`}
        />
        <ProfileTabButton
          active={tab === "gauntlets"}
          onClick={() => setPickedTab("gauntlets")}
          label="Gauntlets"
        />
        {isOwner && (
          <ProfileTabButton
            active={tab === "courtroom"}
            onClick={() => setPickedTab("courtroom")}
            label={`Pending & rejected${
              courtroomRuns?.length ? ` (${courtroomRuns.length})` : ""
            }`}
          />
        )}
      </div>

      {tab === "speedruns" && <SpeedrunShelf runs={speedruns ?? []} />}

      {tab === "gauntlets" && (
        <>
          <section className="mt-8 grid gap-8 sm:grid-cols-2">
            <ModeCard label="Standard" mode={profile.standard} />
            <ModeCard label="Lite" mode={profile.lite} />
          </section>

          <Bestiary
            beaten={profile.beaten ?? []}
            killers={profile.killers ?? []}
          />

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
        </>
      )}

      {tab === "courtroom" && isOwner && (
        <CourtroomShelf runs={courtroomRuns} />
      )}
    </main>
  );
}

function ProfileTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 pb-3 transition ${
        active
          ? "border-gold text-gold"
          : "border-transparent text-faint hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Current verified PBs — the public trophy room. Rows open the game board. */
function SpeedrunShelf({ runs }: { runs: Submission[] }) {
  if (runs.length === 0) {
    return (
      <p className="mt-6 text-sm text-faint">
        No verified speedruns yet.{" "}
        <Link href="/records" className="text-gold hover:text-gold/80">
          Find a board and submit one.
        </Link>
      </p>
    );
  }

  return (
    <div className="feed-list mt-6">
      {runs.map((run) => (
        <article
          key={run.id}
          className="feed-row flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5 text-sm"
        >
          <div className="min-w-0 flex-1">
            <Link
              href={`/records/${run.gameId}`}
              className="font-medium text-ink hover:text-gold"
            >
              {run.gameTitle}
            </Link>
            <span className="ml-2 text-faint">{run.categoryName}</span>
            <span className="ml-2 inline-flex flex-wrap gap-1">
              {run.variables.map((tag) => (
                <span
                  key={tag.variableValueId}
                  className="border border-gold/20 px-1.5 py-0.5 text-[11px] text-faint"
                >
                  {tag.value}
                </span>
              ))}
            </span>
          </div>
          <span className="font-mono tabular-nums text-gold">
            {formatRecordTime(run.primaryTimeMs)}
          </span>
          <span className="hidden font-mono text-xs text-muted sm:inline">
            {formatRunDate(run.playedOn)}
          </span>
          <a
            href={run.videoUrl}
            target="_blank"
            rel="noreferrer"
            title="Watch the proof video"
            className="text-faint transition hover:text-gold"
          >
            ▶
          </a>
        </article>
      ))}
    </div>
  );
}

/** Owner-only: submissions still pending review, plus rejections with reasons. */
function CourtroomShelf({ runs }: { runs: Submission[] | null }) {
  if (runs === null) {
    return <p className="mt-6 text-sm text-faint">Loading…</p>;
  }
  if (runs.length === 0) {
    return (
      <p className="mt-6 text-sm text-faint">
        Nothing in the courtroom — every submitted run has been verified.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {runs.map((run) => {
        const rejected = run.status === "Rejected";
        return (
          <article
            key={run.id}
            className={`border p-4 text-sm ${
              rejected
                ? "border-red-400/30 bg-red-500/5"
                : "border-gold/20 bg-black/20"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className={`border px-2 py-0.5 text-[11px] uppercase tracking-wide ${
                  rejected
                    ? "border-red-400/50 text-red-400"
                    : "border-gold/40 text-gold"
                }`}
              >
                {rejected ? "Rejected" : "Pending review"}
              </span>
              <Link
                href={`/records/${run.gameId}`}
                className="font-medium text-ink hover:text-gold"
              >
                {run.gameTitle}
              </Link>
              <span className="text-faint">{run.categoryName}</span>
              <span className="font-mono tabular-nums text-muted">
                {formatRecordTime(run.primaryTimeMs)}
              </span>
              <span className="ml-auto font-mono text-xs text-faint">
                submitted {formatRunDate(run.submittedAt)}
              </span>
            </div>
            {rejected && run.rejectReason && (
              <p className="mt-2 border-l-2 border-red-400/50 pl-3 leading-relaxed text-red-200/90">
                {run.examinerName ? `${run.examinerName}: ` : ""}
                {run.rejectReason}
              </p>
            )}
            <a
              href={run.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-faint hover:text-gold"
            >
              Watch submitted VOD ↗
            </a>
          </article>
        );
      })}
    </div>
  );
}

function LiveRunCallout({ live }: { live: ProfileLiveRun }) {
  const { state, syncedAt } = useOverlayRun(live.runId);
  const isLite = (state?.runType ?? live.runType) === "Lite";
  const title = state?.games[state.currentSlotIndex]?.title ?? live.currentTitle ?? "the next game";
  const thumb =
    state?.games[state.currentSlotIndex]?.thumb ?? live.currentThumb;
  const currentSlot = state ? state.currentSlotIndex + 1 : live.currentSlot;
  const totalSlots = state?.games.length ?? live.totalSlots;
  const elapsedMs = state?.elapsedMs ?? live.elapsedMs ?? 0;
  const timerStatus = state?.timerStatus ?? live.timerStatus ?? "idle";
  const clockReady = syncedAt > 0 || (live.elapsedMs ?? 0) > 0 || timerStatus !== "idle";

  return (
    <Link href={`/run/${live.runId}`} className="live-run-banner">
      <span className="live-run-kicker">
        <span className="live-run-dot" aria-hidden />
        Live run
      </span>
      {thumb ? (
        <span className="live-run-thumb">
          <Image
            src={thumb}
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
          On game {currentSlot} of {totalSlots}
          {isLite ? " · Lite" : ""}
        </span>
        <span className="live-run-game">{title}</span>
      </span>
      {clockReady ? (
        <span className="live-run-clock">
          <span className="live-run-clock-label">Gauntlet</span>
          <SpeedrunTimer
            elapsedMs={elapsedMs}
            timerStatus={timerStatus}
            syncedAt={syncedAt || 0}
            tone="site"
            className="text-[1.35rem]"
          />
        </span>
      ) : null}
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
