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
    <main className="obs-overlay-root flex w-[420px] flex-col items-center px-3 pt-3 pb-5">
      <GameWheel games={state.games} currentIndex={state.currentSlotIndex} />

      {/* Timer plate: dark glass backing keeps the digits legible over bright gameplay. */}
      <div
        className="mt-8 w-full rounded-2xl border border-white/10 px-6 py-4 backdrop-blur-md"
        style={{
          background:
            "linear-gradient(160deg, rgba(12,17,32,0.88) 0%, rgba(5,8,16,0.92) 100%)",
          boxShadow:
            "0 12px 36px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
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

/* ---------- 3D cylindrical wheel ---------- */

const WHEEL_ITEM_ANGLE_DEG = 28;
const WHEEL_VISIBLE_DISTANCE = 2;

function GameWheel({
  games,
  currentIndex,
}: {
  games: OverlaySlot[];
  currentIndex: number;
}) {
  // Document-flow stack so the timer can sit below the last visible pill
  // instead of colliding with absolutely-positioned 3D overflow.
  const visible = games
    .map((game, index) => ({ game, offset: index - currentIndex }))
    .filter(({ offset }) => Math.abs(offset) <= WHEEL_VISIBLE_DISTANCE);

  return (
    <div className="w-full" style={{ perspective: "1100px" }}>
      <div
        className="flex flex-col items-center gap-3"
        style={{ transformStyle: "preserve-3d" }}
      >
        {visible.map(({ game, offset }) => {
          const distance = Math.abs(offset);
          return (
            <div
              key={game.gameId}
              className="w-full"
              style={{
                transform: `rotateX(${offset * -WHEEL_ITEM_ANGLE_DEG}deg) translateZ(${distance === 0 ? 40 : 6}px) scale(${1 - distance * 0.07})`,
                opacity: distance === 0 ? 1 : distance === 1 ? 0.6 : 0.25,
                filter: distance === 0 ? "none" : `blur(${distance * 0.6}px)`,
                zIndex: 20 - distance,
                pointerEvents: "none",
                transition:
                  "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              <WheelPill
                game={game}
                isActive={offset === 0}
                currentSlot={currentIndex + 1}
                totalSlots={games.length || 10}
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
  currentSlot,
  totalSlots,
}: {
  game: OverlaySlot;
  isActive: boolean;
  currentSlot: number;
  totalSlots: number;
}) {
  if (isActive) {
    return (
      <div
        className="relative mx-auto w-full overflow-hidden rounded-2xl border border-accent-win/50"
        style={{
          background:
            "linear-gradient(135deg, rgba(16,24,44,0.94) 0%, rgba(7,10,20,0.96) 60%)",
          boxShadow:
            "0 12px 36px rgba(0,0,0,0.55), 0 0 26px rgba(0,229,255,0.28), 0 0 70px rgba(0,229,255,0.10), inset 0 1px 0 rgba(255,255,255,0.10)",
        }}
      >
        {/* Neon accent edge */}
        <div
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{
            background: "linear-gradient(180deg, #00e5ff 0%, #00ff66 100%)",
            boxShadow: "0 0 12px rgba(0,229,255,0.8)",
          }}
        />

        <div className="flex items-center gap-3.5 py-3.5 pl-5 pr-4">
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
            <p className="font-heading text-[9px] font-bold uppercase tracking-[0.3em] text-accent-win/90">
              Now Playing
            </p>
            <p className="truncate font-heading text-[17px] font-extrabold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
              {game.title}
            </p>
          </div>

          <div className="shrink-0 text-right font-mono leading-none">
            <span className="text-[26px] font-black text-accent-win [text-shadow:0_0_12px_rgba(0,229,255,0.6)]">
              {currentSlot}
            </span>
            <span className="text-sm font-bold text-gray-500">/{totalSlots}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 backdrop-blur-sm ${
        game.completed ? "border-[#00ff66]/20" : "border-white/10"
      }`}
      style={{ background: "rgba(6,9,18,0.82)" }}
    >
      <span
        className={`w-5 shrink-0 text-center font-mono text-xs font-bold ${
          game.completed ? "text-[#00ff66]" : "text-gray-500"
        }`}
      >
        {game.completed ? "✓" : game.slotNumber}
      </span>

      {game.thumb ? (
        <Image
          src={game.thumb}
          alt=""
          width={36}
          height={36}
          unoptimized
          className={`h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10 ${
            game.completed ? "opacity-50 saturate-0" : ""
          }`}
        />
      ) : (
        <div className="h-9 w-9 shrink-0 rounded-lg bg-white/10" />
      )}

      <span
        className={`min-w-0 flex-1 truncate font-heading text-sm font-semibold ${
          game.completed
            ? "text-gray-500 line-through decoration-[#00ff66]/40"
            : "text-gray-200"
        }`}
      >
        {game.title}
      </span>

      {game.completed && (
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#00ff66]/80">
          Clear
        </span>
      )}
    </div>
  );
}
