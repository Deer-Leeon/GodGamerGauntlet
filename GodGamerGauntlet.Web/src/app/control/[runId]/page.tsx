"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useOverlayRun } from "@/lib/useOverlayRun";
import { useOverlayHotkeys } from "@/lib/useOverlayHotkeys";
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

  const rootRef = useRef<HTMLElement>(null);
  const isOwner = Boolean(state?.overlayKey);

  const { resetArmed, requestReset } = useOverlayHotkeys({
    enabled: isOwner,
    togglePlayPause,
    split,
    resetGauntlet,
    onKeyP: previousGame,
  });

  // Click anywhere in the dock so Space/Enter hit our handlers, not a focused button.
  useEffect(() => {
    rootRef.current?.focus();
  }, [state]);

  if (loadError && !state) {
    return (
      <main className="obs-control-root grid h-full min-h-0 flex-1 place-items-center px-4 text-center text-gray-400">
        Run not found.
      </main>
    );
  }

  if (!state) {
    return (
      <main className="obs-control-root grid h-full min-h-0 flex-1 place-items-center px-4 text-center text-gray-500">
        Connecting to run…
      </main>
    );
  }

  const games = state.games;
  const active = games[state.currentSlotIndex];
  const upcoming = games.slice(
    state.currentSlotIndex + 1,
    state.currentSlotIndex + 3,
  );
  const beaten = games.filter((g) => g.completed);
  const running = state.timerStatus === "running";
  const slotLabel = `${Math.min(state.currentSlotIndex + 1, games.length)}/${games.length}`;

  const copyUrl = async (which: "overlay" | "dock") => {
    const url =
      which === "overlay"
        ? `${window.location.origin}/overlay/${state.runId}?key=${state.overlayKey}`
        : window.location.href;
    await navigator.clipboard.writeText(url);
  };

  return (
    <main
      ref={rootRef}
      tabIndex={-1}
      onPointerDown={() => {
        window.focus();
        rootRef.current?.focus();
      }}
      className="obs-control-root flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2 outline-none"
    >
      <header className="flex shrink-0 items-baseline justify-between gap-2">
        <h1 className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-accent-streak">
          Control Deck
        </h1>
        <p className="truncate font-mono text-[11px] uppercase tracking-widest text-gray-400">
          {state.runStatus} · {slotLabel}
        </p>
      </header>

      {!authLoading && !isOwner && (
        <div className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
          {user ? (
            "You are not the owner of this run — controls are disabled."
          ) : (
            <>
              <Link href="/login" className="font-bold underline">
                Sign in
              </Link>{" "}
              as the run owner to use the controls.
            </>
          )}
        </div>
      )}

      <div className="panel flex shrink-0 flex-col items-center rounded-xl py-2">
        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          className="text-[42px]"
        />
        <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500">
          {resetArmed ? "Press R again to reset" : state.timerStatus}
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={togglePlayPause}
          disabled={!isOwner || state.timerStatus === "finished"}
          className={`col-span-2 rounded-xl py-3 font-heading text-lg font-black uppercase tracking-wider text-dark disabled:opacity-40 ${
            running
              ? "bg-amber-400 hover:brightness-110"
              : "bg-[#00ff66] hover:brightness-110"
          }`}
        >
          {running ? "❚❚ Pause" : "▶ Play"}
          <KeyHint>Space</KeyHint>
        </button>

        <button
          type="button"
          onClick={split}
          disabled={!isOwner || state.runStatus !== "Active"}
          className="col-span-2 rounded-xl bg-accent-win py-3 font-heading text-base font-black uppercase tracking-wider text-dark hover:brightness-110 disabled:opacity-40"
        >
          Game Beaten — Next ▸
          <KeyHint>Enter</KeyHint>
        </button>

        <button
          type="button"
          onClick={previousGame}
          disabled={!isOwner}
          className="rounded-xl border border-white/15 bg-white/5 py-2.5 font-heading text-sm font-bold uppercase tracking-wider text-gray-300 hover:bg-white/10 disabled:opacity-40"
        >
          ◂ Undo
          <KeyHint>P</KeyHint>
        </button>

        <button
          type="button"
          onClick={requestReset}
          disabled={!isOwner}
          className={`rounded-xl py-2.5 font-heading text-sm font-bold uppercase tracking-wider disabled:opacity-40 ${
            resetArmed
              ? "bg-accent-death text-white"
              : "border border-accent-death/50 bg-accent-death/10 text-accent-death hover:bg-accent-death/20"
          }`}
        >
          {resetArmed ? "Confirm reset?" : "Reset"}
          <KeyHint>R R</KeyHint>
        </button>
      </div>

      {actionError && (
        <p className="shrink-0 text-center text-xs text-accent-death">
          {actionError}
        </p>
      )}

      <section className="panel min-h-0 flex-1 overflow-y-auto rounded-xl p-2.5">
        {active && (
          <GameRow game={active} label="Now" highlight />
        )}
        {upcoming.map((game, index) => (
          <GameRow
            key={game.gameId}
            game={game}
            label={index === 0 ? "Next" : "Then"}
          />
        ))}
        {beaten.length > 0 && (
          <div className="mt-2 border-t border-white/10 pt-2">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-gray-500">
              Splits
            </p>
            <div className="flex flex-col gap-0.5">
              {beaten.map((game) => (
                <div
                  key={game.gameId}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-gray-400">
                    <span className="mr-1.5 font-mono text-[#00ff66]">✓</span>
                    {game.title}
                  </span>
                  <span className="shrink-0 font-mono text-[#00ff66]">
                    {game.splitTimeMs !== null
                      ? formatSpeedrunTime(game.splitTimeMs)
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {isOwner && (
        <details className="panel shrink-0 rounded-xl px-2.5 py-1.5 text-xs text-gray-400">
          <summary className="cursor-pointer font-heading text-[10px] font-bold uppercase tracking-widest text-accent-streak">
            OBS setup / copy URLs
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-gray-300">
            <li>
              Stream overlay: Sources → Browser. Width{" "}
              <span className="font-mono text-accent-win">840</span> × Height{" "}
              <span className="font-mono text-accent-win">680</span>, then
              Transform → Reset Transform.
            </li>
            <li>
              This deck: Docks → Custom Browser Docks. Opaque is expected.
            </li>
          </ol>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void copyUrl("overlay")}
              className="flex-1 rounded-lg border border-accent-streak/50 py-1.5 font-heading text-[10px] font-bold uppercase tracking-wider text-accent-streak"
            >
              Copy overlay URL
            </button>
            <button
              type="button"
              onClick={() => void copyUrl("dock")}
              className="flex-1 rounded-lg border border-white/15 py-1.5 font-heading text-[10px] font-bold uppercase tracking-wider text-gray-300"
            >
              Copy deck URL
            </button>
          </div>
        </details>
      )}
    </main>
  );
}

function KeyHint({ children }: { children: string }) {
  return (
    <span className="ml-2 font-mono text-[10px] font-bold tracking-widest opacity-70">
      {children}
    </span>
  );
}

function GameRow({
  game,
  label,
  highlight = false,
}: {
  game: {
    title: string;
    thumb: string | null;
    slotNumber: number;
    baseDifficulty: number;
  };
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-9 shrink-0 font-mono text-[9px] font-bold uppercase tracking-widest text-gray-500">
        {label}
      </span>
      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-7 w-7 shrink-0 rounded bg-white/10" />
      )}
      <p
        className={`min-w-0 flex-1 truncate text-sm font-heading font-bold ${
          highlight ? "text-accent-win" : "text-gray-300"
        }`}
      >
        {game.title}
      </p>
    </div>
  );
}
