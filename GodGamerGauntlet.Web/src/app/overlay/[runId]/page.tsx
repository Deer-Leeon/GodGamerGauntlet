"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { OverlaySlot } from "@/lib/api";
import { useOverlayRun } from "@/lib/useOverlayRun";
import SpeedrunTimer from "@/components/SpeedrunTimer";

/** How long a first R-press stays armed before reset confirmation expires. */
const RESET_ARM_WINDOW_MS = 1500;

/** Must match the Browser Source Width / Height in OBS properties. */
const OVERLAY_W = 420;
const OVERLAY_H = 340;

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
  const [sourceTooTall, setSourceTooTall] = useState(false);
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
    const check = () => setSourceTooTall(window.innerHeight > OVERLAY_H + 4);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
    return (
      <main
        className="obs-overlay-root overflow-hidden"
        style={{ width: OVERLAY_W, height: OVERLAY_H }}
      />
    );
  }

  const beatenCount = state.games.filter((g) => g.completed).length;
  const totalCount = state.games.length || 10;

  return (
    <main
      className="obs-overlay-root relative flex flex-col gap-2 overflow-hidden p-2"
      style={{ width: OVERLAY_W, height: OVERLAY_H }}
    >
      {sourceTooTall && (
        <div className="rounded bg-[#ff3366] px-2 py-1 font-heading text-[11px] font-bold leading-tight text-white">
          Empty space = OBS source is too tall. Double-click the Browser source
          → Width {OVERLAY_W}, Height {OVERLAY_H} → OK. Then right-click →
          Transform → Reset Transform. Do not drag the red box.
        </div>
      )}

      <GameWheel games={state.games} currentIndex={state.currentSlotIndex} />

      <div
        className="mt-auto w-full rounded-lg border border-white/20 px-4 py-2"
        style={{ background: "rgba(8,11,22,0.96)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-heading text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
            Gauntlet Time
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
            {beatenCount}/{totalCount} clear
          </span>
        </div>

        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          className="mt-1 text-center text-[48px]"
        />

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(beatenCount / totalCount) * 100}%`,
              background: "#00ff66",
            }}
          />
        </div>
      </div>

      {resetArmed && (
        <div className="absolute bottom-2 left-2 right-2 rounded bg-accent-death px-3 py-1 text-center font-heading text-xs font-bold uppercase tracking-widest text-white">
          Press R again to reset
        </div>
      )}

      {showHelpers && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
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
      className={`rounded border px-2 py-1 font-heading text-xs font-bold uppercase tracking-wider ${
        danger
          ? "border-accent-death/60 bg-black/80 text-accent-death"
          : "border-accent-win/40 bg-black/80 text-accent-win"
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
    <div className="flex w-full min-h-0 flex-1 flex-col gap-2">
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

function Thumb({ src, size }: { src: string | null; size: number }) {
  if (!src) {
    return (
      <div
        className="shrink-0 rounded bg-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    // Native img: Next/Image wrappers can resample and look soft in OBS CEF.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 rounded object-cover"
      style={{ width: size, height: size }}
    />
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
  const isActive = variant === "active";

  return (
    <div
      className={`relative flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-lg border px-3 py-2 ${
        isActive ? "border-[#00e5ff]" : "border-white/25"
      }`}
      style={{ background: isActive ? "rgba(10,16,32,0.96)" : "rgba(10,14,26,0.94)" }}
    >
      {isActive && (
        <div className="absolute inset-y-0 left-0 w-[3px] bg-[#00e5ff]" />
      )}

      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-sm font-black ${
          isActive ? "bg-[#00e5ff]/15 text-[#00e5ff]" : "text-gray-200"
        }`}
      >
        {game.slotNumber}
      </span>

      <Thumb src={game.thumb} size={isActive ? 48 : 44} />

      <div className="min-w-0 flex-1">
        <p
          className={`font-heading text-[11px] font-bold uppercase tracking-[0.2em] ${
            isActive ? "text-[#00e5ff]" : "text-gray-400"
          }`}
        >
          {isActive ? "Now Playing" : variant === "next" ? "Up Next" : "Then"}
        </p>
        <p className="truncate font-heading text-lg font-extrabold leading-tight text-white">
          {game.title}
        </p>
      </div>

      {isActive && (
        <div className="shrink-0 text-right font-mono leading-none">
          <span className="text-[26px] font-black text-[#00e5ff]">{currentSlot}</span>
          <span className="text-sm font-bold text-gray-400">/{totalSlots}</span>
        </div>
      )}
    </div>
  );
}
