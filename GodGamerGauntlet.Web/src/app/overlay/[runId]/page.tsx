"use client";

import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { OverlaySlot } from "@/lib/api";
import { useOverlayRun } from "@/lib/useOverlayRun";
import SpeedrunTimer from "@/components/SpeedrunTimer";

/** How long a first R-press stays armed before reset confirmation expires. */
const RESET_ARM_WINDOW_MS = 1500;

export default function OverlayPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <OverlayView />
    </Suspense>
  );
}

function OverlayView() {
  const { runId } = useParams<{ runId: string }>();
  const overlayKey = useSearchParams().get("key");
  const { state, syncedAt, togglePlayPause, split, previousGame, resetGauntlet } =
    useOverlayRun(runId, overlayKey);

  const [showHelpers, setShowHelpers] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Belt-and-suspenders with the CSS :has(.obs-overlay-root) rule.
  useEffect(() => {
    document.documentElement.classList.add("obs-overlay");
    document.body.classList.add("obs-overlay");
    return () => {
      document.documentElement.classList.remove("obs-overlay");
      document.body.classList.remove("obs-overlay");
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case "Space":
          event.preventDefault();
          void togglePlayPause();
          break;
        case "Enter":
        case "NumpadEnter":
          event.preventDefault();
          void split();
          break;
        case "KeyR":
          event.preventDefault();
          setResetArmed((armed) => {
            if (armed) {
              if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
              void resetGauntlet();
              return false;
            }
            // First tap arms the reset; a second tap within the window fires it.
            if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
            resetTimerRef.current = setTimeout(
              () => setResetArmed(false),
              RESET_ARM_WINDOW_MS,
            );
            return true;
          });
          break;
        case "KeyP":
          event.preventDefault();
          setShowHelpers((visible) => !visible);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [togglePlayPause, split, resetGauntlet]);

  if (!state) {
    return <main className="obs-overlay-root h-0 w-[420px] overflow-hidden" />;
  }

  const beatenCount = state.games.filter((g) => g.completed).length;
  const totalCount = state.games.length || 10;

  return (
    <main className="obs-overlay-root flex w-[420px] flex-col items-center px-2 pt-1 pb-1">
      <GameWheel games={state.games} currentIndex={state.currentSlotIndex} />

      {/* Timer plate: dark glass backing keeps the digits legible over bright gameplay. */}
      <div
        className="mt-3 w-full rounded-2xl border border-white/15 px-5 py-3"
        style={{
          background: "rgba(8,11,22,0.94)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-heading text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">
            Gauntlet Time
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
            {beatenCount}/{totalCount} clear
          </span>
        </div>

        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          className="mt-1 text-center text-[54px]"
        />

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${(beatenCount / totalCount) * 100}%`,
              background: "linear-gradient(90deg, #00e5ff 0%, #00ff66 100%)",
              boxShadow: "0 0 10px rgba(0,255,102,0.6)",
            }}
          />
        </div>
      </div>

      {resetArmed && (
        <div className="rounded-md bg-accent-death/90 px-3 py-1 font-heading text-xs font-bold uppercase tracking-widest text-white">
          Press R again to reset
        </div>
      )}

      {showHelpers && (
        <div className="flex items-center gap-2">
          <HelperButton onClick={togglePlayPause}>
            {state.timerStatus === "running" ? "Pause" : "Play"}
          </HelperButton>
          <HelperButton onClick={split}>Split</HelperButton>
          <HelperButton onClick={previousGame}>Undo</HelperButton>
          <HelperButton danger onClick={resetGauntlet}>
            Reset
          </HelperButton>
        </div>
      )}
    </main>
  );
}

function HelperButton({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 font-heading text-xs font-bold uppercase tracking-wider backdrop-blur transition ${
        danger
          ? "border-accent-death/60 bg-black/60 text-accent-death hover:bg-accent-death/20"
          : "border-accent-win/40 bg-black/60 text-accent-win hover:bg-accent-win/10"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Game stack ---------- */

function GameWheel({
  games,
  currentIndex,
}: {
  games: OverlaySlot[];
  currentIndex: number;
}) {
  const active = games[currentIndex];
  const upcoming = games.slice(currentIndex + 1, currentIndex + 3);
  if (!active) return null;

  return (
    <div className="flex w-full flex-col gap-2">
      <WheelPill
        game={active}
        variant="active"
        currentSlot={currentIndex + 1}
        totalSlots={games.length || 10}
      />
      {upcoming.map((game, i) => (
        <WheelPill
          key={game.gameId}
          game={game}
          variant={i === 0 ? "next" : "later"}
          currentSlot={currentIndex + 1}
          totalSlots={games.length || 10}
        />
      ))}
    </div>
  );
}

function WheelPill({
  game,
  variant,
  currentSlot,
  totalSlots,
}: {
  game: OverlaySlot;
  variant: "active" | "next" | "later";
  currentSlot: number;
  totalSlots: number;
}) {
  if (variant === "active") {
    return (
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-accent-win/60"
        style={{
          background: "rgba(10,16,32,0.96)",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.5), 0 0 18px rgba(0,229,255,0.22), inset 0 1px 0 rgba(255,255,255,0.10)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: "linear-gradient(180deg, #00e5ff 0%, #00ff66 100%)" }}
        />

        <div className="flex items-center gap-3 py-3 pl-5 pr-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-win/15 font-mono text-sm font-black text-accent-win ring-1 ring-accent-win/40">
            {game.slotNumber}
          </span>

          {game.thumb ? (
            <Image
              src={game.thumb}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-white/20"
            />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/20" />
          )}

          <div className="min-w-0 flex-1">
            <p className="font-heading text-[10px] font-bold uppercase tracking-[0.28em] text-accent-win">
              Now Playing
            </p>
            <p className="truncate font-heading text-lg font-extrabold leading-snug text-white">
              {game.title}
            </p>
          </div>

          <div className="shrink-0 text-right font-mono leading-none">
            <span className="text-[26px] font-black text-accent-win">
              {currentSlot}
            </span>
            <span className="text-sm font-bold text-gray-400">/{totalSlots}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full items-center gap-3 rounded-xl border border-white/15 px-4 py-2.5"
      style={{ background: "rgba(10,14,26,0.94)" }}
    >
      <span className="w-6 shrink-0 text-center font-mono text-sm font-black text-gray-300">
        {game.slotNumber}
      </span>

      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/15"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
      )}

      <div className="min-w-0 flex-1">
        {variant === "next" && (
          <p className="font-heading text-[10px] font-bold uppercase tracking-[0.28em] text-gray-400">
            Up Next
          </p>
        )}
        <p className="truncate font-heading text-base font-bold leading-snug text-white">
          {game.title}
        </p>
      </div>
    </div>
  );
}
