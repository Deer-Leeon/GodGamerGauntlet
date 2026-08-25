"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOverlayRun } from "@/lib/useOverlayRun";
import SpeedrunTimer, { formatSpeedrunTime } from "@/components/SpeedrunTimer";

export default function ControlDeckPage() {
  const { runId } = useParams<{ runId: string }>();
  const { user, loading: authLoading } = useAuth();
  const {
    state,
    syncedAt,
    loadError,
    actionError,
    togglePlayPause,
    split,
    previousGame,
    resetGauntlet,
  } = useOverlayRun(runId);

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState<"overlay" | "dock" | null>(null);

  // Auto-disarm the reset confirmation after a few seconds.
  useEffect(() => {
    if (!confirmingReset) return;
    const timer = setTimeout(() => setConfirmingReset(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  if (loadError && !state) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-center text-gray-400">
        Run not found.
      </main>
    );
  }

  if (!state) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-center text-gray-500">
        Connecting to run…
      </main>
    );
  }

  // The API only reveals the overlay key to the run owner.
  const isOwner = state.overlayKey !== null;
  const games = state.games;
  const active = games[state.currentSlotIndex];
  const upcoming = games.slice(state.currentSlotIndex + 1, state.currentSlotIndex + 4);
  const beaten = games.filter((g) => g.completed);
  const running = state.timerStatus === "running";

  const copyUrl = async (which: "overlay" | "dock") => {
    const url =
      which === "overlay"
        ? `${window.location.origin}/overlay/${state.runId}?key=${state.overlayKey}`
        : window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <header className="text-center">
        <h1 className="font-heading text-lg font-bold uppercase tracking-[0.2em] text-accent-streak">
          Control Deck
        </h1>
        <p className="text-sm text-gray-400">
          {state.streamerName} · {state.runStatus} ·{" "}
          {Math.min(state.currentSlotIndex + 1, games.length)}/{games.length}
        </p>
      </header>

      {!authLoading && !isOwner && (
        <div className="panel rounded-xl p-4 text-center text-sm text-amber-300">
          {user
            ? "You are not the owner of this run — controls are disabled."
            : "Sign in as the run owner to use the controls."}
        </div>
      )}

      {/* Live mirrored timer */}
      <div className="panel flex flex-col items-center rounded-2xl py-5">
        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          className="text-5xl"
        />
        <span className="mt-1 font-mono text-xs uppercase tracking-widest text-gray-500">
          {state.timerStatus}
        </span>
      </div>

      {/* Core actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={togglePlayPause}
          disabled={!isOwner || state.timerStatus === "finished"}
          className={`col-span-2 rounded-2xl py-6 font-heading text-2xl font-black uppercase tracking-wider text-dark transition active:scale-[0.98] disabled:opacity-40 ${
            running
              ? "bg-amber-400 hover:brightness-110"
              : "bg-[#00ff66] hover:brightness-110"
          }`}
        >
          {running ? "❚❚ Pause" : "▶ Play"}
        </button>

        <button
          onClick={split}
          disabled={!isOwner || state.runStatus !== "Active"}
          className="col-span-2 rounded-2xl bg-accent-win py-6 font-heading text-xl font-black uppercase tracking-wider text-dark transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
        >
          Game Beaten — Next ▸
        </button>

        <button
          onClick={previousGame}
          disabled={!isOwner}
          className="rounded-2xl border border-white/15 bg-white/5 py-4 font-heading font-bold uppercase tracking-wider text-gray-300 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
        >
          ◂ Undo Previous
        </button>

        <button
          onClick={() => {
            if (confirmingReset) {
              setConfirmingReset(false);
              void resetGauntlet();
            } else {
              setConfirmingReset(true);
            }
          }}
          disabled={!isOwner}
          className={`rounded-2xl py-4 font-heading font-bold uppercase tracking-wider transition active:scale-[0.98] disabled:opacity-40 ${
            confirmingReset
              ? "bg-accent-death text-white"
              : "border border-accent-death/50 bg-accent-death/10 text-accent-death hover:bg-accent-death/20"
          }`}
        >
          {confirmingReset ? "Confirm reset?" : "Reset Gauntlet"}
        </button>
      </div>

      {actionError && (
        <p className="text-center text-sm text-accent-death">{actionError}</p>
      )}

      {/* Mirrored run state */}
      {active && state.runStatus === "Active" && (
        <section className="panel rounded-2xl p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-500">
            Now playing
          </h2>
          <GameRow game={active} highlight />
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="panel rounded-2xl p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-500">
            Up next
          </h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((game) => (
              <GameRow key={game.gameId} game={game} />
            ))}
          </div>
        </section>
      )}

      {beaten.length > 0 && (
        <section className="panel rounded-2xl p-4">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-gray-500">
            Splits
          </h2>
          <div className="flex flex-col gap-1.5">
            {beaten.map((game) => (
              <div
                key={game.gameId}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-gray-400">
                  <span className="mr-2 font-mono text-[#00ff66]">✓</span>
                  {game.title}
                </span>
                <span className="ml-3 shrink-0 font-mono text-[#00ff66]">
                  {game.splitTimeMs !== null
                    ? formatSpeedrunTime(game.splitTimeMs)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOwner && (
        <section className="panel flex flex-col gap-3 rounded-2xl p-4 text-sm">
          <h2 className="font-heading text-xs font-bold uppercase tracking-widest text-accent-streak">
            OBS setup
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-gray-300">
            <li>
              <span className="font-semibold text-white">On the stream:</span>{" "}
              Sources → <span className="text-accent-win">Browser</span>. Paste
              the overlay URL. In the properties window set Width{" "}
              <span className="font-mono text-accent-win">840</span> and Height{" "}
              <span className="font-mono text-accent-win">680</span>, then OK.
              Right-click the source → Transform →{" "}
              <span className="text-white">Reset Transform</span>. The overlay
              renders sharp at any size with that shape — shrinking it on the
              canvas is fine, stretching it bigger is not.
            </li>
            <li>
              <span className="font-semibold text-white">For buttons:</span>{" "}
              Docks → Custom Browser Docks → paste this control-deck URL. Docks
              are always opaque — that is expected.
            </li>
          </ol>
          <button
            onClick={() => copyUrl("overlay")}
            className="rounded-2xl border border-accent-streak/50 bg-accent-streak/10 py-3 font-heading text-sm font-bold uppercase tracking-wider text-accent-streak transition hover:bg-accent-streak/20"
          >
            {copied === "overlay" ? "Copied!" : "Copy overlay URL (Browser Source)"}
          </button>
          <button
            onClick={() => copyUrl("dock")}
            className="rounded-2xl border border-white/15 bg-white/5 py-3 font-heading text-sm font-bold uppercase tracking-wider text-gray-300 transition hover:bg-white/10"
          >
            {copied === "dock" ? "Copied!" : "Copy this deck URL (OBS Dock)"}
          </button>
          <p className="text-xs text-gray-500">
            Chrome and OBS docks cannot punch through to your game capture. Only
            a Browser Source in the scene is transparent.
          </p>
        </section>
      )}

      <p className="text-center text-xs text-gray-600">
        Overlay hotkeys: Space play/pause · Enter split · R×2 reset · P helper
        buttons
      </p>
    </main>
  );
}

function GameRow({
  game,
  highlight = false,
}: {
  game: { title: string; thumb: string | null; slotNumber: number; baseDifficulty: number };
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate font-heading font-bold ${
            highlight ? "text-accent-win" : "text-gray-300"
          }`}
        >
          {game.title}
        </p>
        <p className="text-xs text-gray-500">
          Slot {game.slotNumber} · difficulty {game.baseDifficulty}
        </p>
      </div>
    </div>
  );
}
