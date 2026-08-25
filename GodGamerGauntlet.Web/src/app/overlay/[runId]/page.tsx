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

  // OBS browser source: fully transparent capture surface, no scrollbars.
  useEffect(() => {
    document.documentElement.classList.add("obs-overlay");
    return () => document.documentElement.classList.remove("obs-overlay");
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

  if (!state) return null;

  return (
    <main className="flex w-[420px] flex-col items-center gap-3 p-4">
      <GameWheel games={state.games} currentIndex={state.currentSlotIndex} />

      <SpeedrunTimer
        elapsedMs={state.elapsedMs}
        timerStatus={state.timerStatus}
        syncedAt={syncedAt}
        className="text-5xl"
      />

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

/* ---------- 3D cylindrical wheel ---------- */

const WHEEL_ITEM_ANGLE_DEG = 32;
const WHEEL_RADIUS_PX = 168;
const WHEEL_VISIBLE_DISTANCE = 2;

function GameWheel({
  games,
  currentIndex,
}: {
  games: OverlaySlot[];
  currentIndex: number;
}) {
  return (
    <div className="relative h-[280px] w-full" style={{ perspective: "1000px" }}>
      <div
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d" }}
      >
        {games.map((game, index) => {
          const offset = index - currentIndex;
          const distance = Math.abs(offset);
          const isActive = offset === 0;

          return (
            <div
              key={game.gameId}
              className="absolute left-0 right-0 top-1/2"
              style={{
                transform: `translateY(-50%) rotateX(${offset * -WHEEL_ITEM_ANGLE_DEG}deg) translateZ(${WHEEL_RADIUS_PX}px)`,
                opacity:
                  distance === 0 ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.18 : 0,
                zIndex: 20 - distance,
                pointerEvents: "none",
                transition:
                  "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)",
                visibility:
                  distance > WHEEL_VISIBLE_DISTANCE ? "hidden" : "visible",
              }}
            >
              <WheelPill
                game={game}
                isActive={isActive}
                slotLabel={`${currentIndex + 1}/${games.length || 10}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WheelPill({
  game,
  isActive,
  slotLabel,
}: {
  game: OverlaySlot;
  isActive: boolean;
  slotLabel: string;
}) {
  return (
    <div
      className={`mx-auto flex w-[400px] items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur-sm ${
        isActive
          ? "border-accent-win/80 bg-black/75"
          : "border-white/15 bg-black/55"
      }`}
      style={
        isActive
          ? {
              boxShadow:
                "0 0 22px rgba(0,229,255,0.45), 0 0 55px rgba(0,229,255,0.18), inset 0 0 14px rgba(0,229,255,0.12)",
            }
          : undefined
      }
    >
      <span
        className={`w-6 shrink-0 text-center font-mono text-sm font-bold ${
          game.completed
            ? "text-[#00ff66]"
            : isActive
              ? "text-accent-win"
              : "text-gray-500"
        }`}
      >
        {game.completed ? "✓" : game.slotNumber}
      </span>

      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={44}
          height={44}
          unoptimized
          className={`h-11 w-11 shrink-0 rounded-lg object-cover ${
            game.completed ? "opacity-60 saturate-50" : ""
          }`}
        />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded-lg bg-white/10" />
      )}

      <span
        className={`min-w-0 flex-1 truncate font-heading font-bold ${
          isActive
            ? "text-base text-white"
            : game.completed
              ? "text-sm text-gray-500 line-through"
              : "text-sm text-gray-300"
        }`}
      >
        {game.title}
      </span>

      {isActive && (
        <span className="shrink-0 font-mono text-sm font-black text-accent-win">
          {slotLabel}
        </span>
      )}
    </div>
  );
}
