"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { slotsForRunType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { pinControlRun } from "@/lib/controlSession";
import { useOverlayRun } from "@/lib/useOverlayRun";
import { useOverlayHotkeys } from "@/lib/useOverlayHotkeys";
import SpeedrunTimer, { formatSpeedrunTime } from "@/components/SpeedrunTimer";

export type ControlBoardVariant = "dock" | "panel";

interface ControlBoardProps {
  runId: string;
  variant: ControlBoardVariant;
  /** Global = whole window (OBS dock / control room). Local = only this panel. */
  hotkeys?: false | "global" | "local";
  showSetup?: boolean;
}

export default function ControlBoard({
  runId,
  variant,
  hotkeys = "global",
  showSetup = variant === "dock",
}: ControlBoardProps) {
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

  const rootRef = useRef<HTMLDivElement>(null);
  const isOwner = Boolean(state?.overlayKey);
  const dock = variant === "dock";

  const { resetArmed, requestReset } = useOverlayHotkeys({
    enabled: hotkeys !== false && isOwner,
    togglePlayPause,
    split,
    resetGauntlet,
    onKeyP: previousGame,
    limitTo: hotkeys === "local" ? rootRef : undefined,
  });

  useEffect(() => {
    if (isOwner) pinControlRun(runId);
  }, [isOwner, runId]);

  useEffect(() => {
    if (variant === "panel") return;
    rootRef.current?.focus();
  }, [variant, state]);

  if (loadError && !state) {
    return (
      <div className="grid flex-1 place-items-center px-4 text-center text-gray-400">
        Run not found.
      </div>
    );
  }

  if (!state) {
    return (
      <div className="grid flex-1 place-items-center px-4 text-center text-gray-500">
        Connecting to run…
      </div>
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
  const totalSlots = games.length || slotsForRunType(state.runType);
  const slotLabel = `${Math.min(state.currentSlotIndex + 1, totalSlots)}/${totalSlots}`;

  const copyUrl = async (which: "overlay" | "dock") => {
    const origin = window.location.origin;
    const url =
      which === "overlay"
        ? `${origin}/overlay/${state.runId}?key=${state.overlayKey}`
        : `${origin}/control/${state.runId}?dock=1`;
    await navigator.clipboard.writeText(url);
  };

  const body = (
    <>
      <header className="flex shrink-0 items-baseline justify-between gap-2">
        <h1 className="text-sm font-medium text-ink">
          Control deck
          {state.runType === "Lite" ? (
            <span className="ml-2 font-normal text-gray-500">Lite</span>
          ) : null}
        </h1>
        <p className="truncate font-mono text-[12px] tabular-nums text-gray-500">
          {state.runStatus === "Completed"
            ? "Clear"
            : state.runStatus === "Failed"
              ? "DNF"
              : "Live"}{" "}
          · {slotLabel}
        </p>
      </header>

      {!authLoading && !isOwner && (
        <div className="shrink-0 border border-white/15 px-3 py-2 text-center text-xs text-gray-400">
          {user ? (
            "You are not the owner of this run — controls are disabled."
          ) : (
            <>
              <Link href="/login" className="text-ink underline underline-offset-2">
                Sign in
              </Link>{" "}
              as the run owner to use the controls.
            </>
          )}
        </div>
      )}

      <div className="flex shrink-0 flex-col items-center border-y border-gold/20 py-3">
        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          tone="site"
          className={dock ? "text-[40px]" : "text-[34px]"}
        />
        <span className="mt-1 text-[11px] text-gray-500">
          {resetArmed ? "Press R again to reset" : state.timerStatus}
        </span>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={togglePlayPause}
          disabled={!isOwner || state.timerStatus === "finished"}
          className={`col-span-2 py-2.5 text-sm disabled:opacity-40 ${
            running
              ? "border border-gold/40 text-gold hover:bg-gold/10"
              : "bg-gold text-dark hover:bg-gold/90"
          }`}
        >
          {running ? "Pause" : "Play"}
          <KeyHint>Space</KeyHint>
        </button>

        <button
          type="button"
          onClick={split}
          disabled={!isOwner || state.runStatus !== "Active"}
          className="col-span-2 border border-gold/35 py-2.5 text-sm text-gold hover:bg-gold/10 disabled:opacity-40"
        >
          Game beaten — next
          <KeyHint>Enter</KeyHint>
        </button>

        <button
          type="button"
          onClick={previousGame}
          disabled={!isOwner}
          className="border border-white/15 py-2 text-sm text-gray-400 hover:text-ink disabled:opacity-40"
        >
          Undo
          <KeyHint>P</KeyHint>
        </button>

        <button
          type="button"
          onClick={requestReset}
          disabled={!isOwner}
          className={`py-2 text-sm disabled:opacity-40 ${
            resetArmed
              ? "border border-red-400/50 text-red-400"
              : "border border-white/15 text-gray-400 hover:text-red-400/80"
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

      <section
        className={`min-h-0 ${dock ? "flex-1 overflow-y-auto" : ""}`}
      >
        {active && <GameRow game={active} label="Now" highlight />}
        {upcoming.map((game, index) => (
          <GameRow
            key={game.gameId}
            game={game}
            label={index === 0 ? "Next" : "Then"}
          />
        ))}
        {beaten.length > 0 && (
          <table className="mt-3 w-full border-collapse border-t border-gold/20 pt-2 text-[12px]">
            <caption className="sr-only">Splits</caption>
            <tbody>
              {beaten.map((game, i) => (
                <tr
                  key={game.gameId}
                  className="border-t border-white/8 text-gray-500 first:border-t-0"
                >
                  <td className="w-6 py-0.5 pr-2 font-mono tabular-nums text-gray-600">
                    {i + 1}
                  </td>
                  <td className="max-w-0 truncate py-0.5 pr-3 text-gray-400">
                    {game.title}
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {game.splitTimeMs !== null
                      ? formatSpeedrunTime(game.splitTimeMs)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {showSetup && isOwner && (
        <details className="shrink-0 border-t border-white/12 pt-2 text-xs text-gray-500">
          <summary className="cursor-pointer text-[12px] text-gray-400">
            OBS setup / copy URLs
          </summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-4">
            <li>
              Stream overlay: Sources → Browser. Width{" "}
              <span className="font-mono text-ink">840</span> × Height{" "}
              <span className="font-mono text-ink">680</span>, then Transform →
              Reset Transform.
            </li>
            <li>
              OBS buttons: Docks → Custom Browser Docks, paste the dock URL
              (it includes <span className="font-mono">?dock=1</span>). Opaque
              is expected.
            </li>
          </ol>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void copyUrl("overlay")}
              className="flex-1 border border-white/20 py-1.5 text-[11px] text-ink hover:bg-white/5"
            >
              Copy overlay URL
            </button>
            <button
              type="button"
              onClick={() => void copyUrl("dock")}
              className="flex-1 border border-white/15 py-1.5 text-[11px] text-gray-400 hover:text-ink"
            >
              Copy dock URL
            </button>
          </div>
        </details>
      )}
    </>
  );

  if (dock) {
    return (
      <div
        ref={rootRef}
        role="main"
        tabIndex={-1}
        onPointerDown={() => {
          window.focus();
          rootRef.current?.focus();
        }}
        className="obs-control-root flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2 outline-none"
      >
        {body}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onPointerDown={() => rootRef.current?.focus()}
      className="flex flex-col gap-2 outline-none"
    >
      {body}
    </div>
  );
}

function KeyHint({ children }: { children: string }) {
  return (
    <span className="ml-2 font-mono text-[10px] text-gray-500">{children}</span>
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
      <span className="w-9 shrink-0 text-[11px] text-gray-500">{label}</span>
      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 object-cover"
        />
      ) : (
        <div className="h-7 w-7 shrink-0 bg-white/10" />
      )}
      <p
        className={`min-w-0 flex-1 truncate text-sm ${
          highlight ? "text-ink" : "text-gray-400"
        }`}
      >
        {game.title}
      </p>
    </div>
  );
}
