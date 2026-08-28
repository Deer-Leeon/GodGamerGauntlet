"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { slotsForRunType, type OverlaySlot } from "@/lib/api";
import { useOverlayRun } from "@/lib/useOverlayRun";
import { useOverlayHotkeys } from "@/lib/useOverlayHotkeys";
import SpeedrunTimer from "@/components/SpeedrunTimer";
import AttemptCodeMark from "@/components/AttemptCodeMark";
import { REACTIONS } from "@/components/RunSocial";

/**
 * Design-space size. The overlay re-renders natively at whatever size the
 * OBS Browser Source is (via CSS zoom), so any source with a 420:340 aspect
 * ratio is pixel-sharp — recommended: 840×680.
 */
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
  const [scale, setScale] = useState(1);
  const [aspectOff, setAspectOff] = useState(false);
  const [deathSting, setDeathSting] = useState(false);
  const prevStatus = useRef<string | null>(null);

  const { resetArmed } = useOverlayHotkeys({
    enabled: Boolean(state),
    togglePlayPause,
    split,
    resetGauntlet,
    onKeyP: () => setShowHelpers((visible) => !visible),
  });

  // Belt-and-suspenders with the CSS :has(.obs-overlay-root) rule.
  useEffect(() => {
    document.documentElement.classList.add("obs-overlay");
    document.body.classList.add("obs-overlay");
    return () => {
      document.documentElement.classList.remove("obs-overlay");
      document.body.classList.remove("obs-overlay");
    };
  }, []);

  // Fill the Browser Source natively: zoom re-renders text/vectors at the
  // real source resolution, so a bigger source means sharper pixels.
  useEffect(() => {
    const update = () => {
      const nextScale = window.innerWidth / OVERLAY_W;
      setScale(nextScale);
      setAspectOff(Math.abs(window.innerHeight - OVERLAY_H * nextScale) > 8);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!state) return;
    if (
      prevStatus.current &&
      prevStatus.current !== "Failed" &&
      state.runStatus === "Failed"
    ) {
      setDeathSting(true);
      const timer = window.setTimeout(() => setDeathSting(false), 900);
      prevStatus.current = state.runStatus;
      return () => window.clearTimeout(timer);
    }
    prevStatus.current = state.runStatus;
  }, [state]);

  if (!state) {
    return (
      <main
        className="obs-overlay-root overflow-hidden"
        style={{ width: OVERLAY_W, height: OVERLAY_H, zoom: scale }}
      />
    );
  }

  const beatenCount = state.games.filter((g) => g.completed).length;
  const totalCount = state.games.length || slotsForRunType(state.runType);
  const isLite = state.runType === "Lite";

  return (
    <main
      className={`obs-overlay-root relative flex flex-col gap-2 overflow-hidden p-2 ${
        deathSting ? "overlay-death-sting" : ""
      }`}
      style={{ width: OVERLAY_W, height: OVERLAY_H, zoom: scale }}
    >
      {aspectOff && (
        <div className="bg-black px-2 py-1 text-[11px] leading-tight text-white">
          Wrong source shape. Double-click the Browser source and set Height to{" "}
          {Math.round(OVERLAY_H * scale)} (keep Width as is). Recommended: 840 ×
          680.
        </div>
      )}

      <GameWheel
        games={state.games}
        currentIndex={state.currentSlotIndex}
        totalSlots={totalCount}
        failed={state.runStatus === "Failed"}
      />

      <div
        className="mt-auto w-full border border-white/25 px-4 py-2"
        style={{ background: "rgba(8,8,10,0.96)" }}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            Time
            {isLite && <span className="text-gray-500">· Lite</span>}
          </span>
          <span className="flex items-center gap-2">
            <AttemptCodeMark code={state.attemptCode} tone="overlay" />
            <CrowdTicks reactions={state.reactions ?? {}} />
          </span>
        </div>

        <SpeedrunTimer
          elapsedMs={state.elapsedMs}
          timerStatus={state.timerStatus}
          syncedAt={syncedAt}
          className="mt-1 text-center text-[48px]"
        />

        <div className="mt-2 flex items-center justify-between">
          <div className="h-px flex-1 bg-white/20">
            <div
              className="h-px bg-white"
              style={{ width: `${(beatenCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="ml-3 font-mono text-[11px] tabular-nums text-gray-400">
            {beatenCount}/{totalCount}
          </span>
        </div>
      </div>

      {resetArmed && (
        <div className="absolute bottom-2 left-2 right-2 bg-black px-3 py-1 text-center text-xs text-white">
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
      className={`border px-2 py-1 text-xs ${
        danger
          ? "border-white/40 bg-black/80 text-white"
          : "border-white/40 bg-black/80 text-white"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- Game stack ---------- */

function CrowdTicks({ reactions }: { reactions: Record<string, number> }) {
  return (
    <span className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-white">
      {REACTIONS.map(({ type, emoji }) => (
        <span key={type}>
          {emoji}
          {reactions[type] ?? 0}
        </span>
      ))}
    </span>
  );
}

function GameWheel({
  games,
  currentIndex,
  totalSlots,
  failed,
}: {
  games: OverlaySlot[];
  currentIndex: number;
  totalSlots: number;
  failed: boolean;
}) {
  const active = games[currentIndex];
  const upcoming = games.slice(currentIndex + 1, currentIndex + 3);
  if (!active) return null;
  const dead = failed || active.status === "Lost";

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-2">
      <WheelPill
        game={active}
        variant={dead ? "dead" : "active"}
        currentSlot={currentIndex + 1}
        totalSlots={totalSlots}
      />
      {upcoming.map((game, i) => (
        <WheelPill
          key={game.gameId}
          game={game}
          variant={i === 0 ? "next" : "later"}
          currentSlot={currentIndex + 1}
          totalSlots={totalSlots}
        />
      ))}
    </div>
  );
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  if (!src) {
    return (
      <div
        className="shrink-0 bg-white/10"
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
      className="shrink-0 object-cover"
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
  variant: "active" | "next" | "later" | "dead";
  currentSlot: number;
  totalSlots: number;
}) {
  const isActive = variant === "active";
  const isDead = variant === "dead";

  return (
    <div
      className={`relative flex w-full shrink-0 items-center gap-3 overflow-hidden border px-3 py-2 ${
        isDead ? "border-red-400/70" : isActive ? "border-white/50" : "border-white/25"
      }`}
      style={{ background: isActive || isDead ? "rgba(10,10,12,0.96)" : "rgba(10,10,12,0.92)" }}
    >
      {isActive && !isDead && (
        <div className="absolute inset-y-0 left-0 w-[2px] bg-white" />
      )}
      {isDead && (
        <div className="absolute inset-y-0 left-0 w-[2px] bg-red-400" />
      )}

      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center font-mono text-sm ${
          isDead ? "text-red-300" : isActive ? "text-white" : "text-gray-300"
        }`}
      >
        {game.slotNumber}
      </span>

      <Thumb src={game.thumb} size={isActive || isDead ? 48 : 44} />

      <div className="min-w-0 flex-1">
        <p className={`text-[11px] ${isDead ? "text-red-300" : isActive ? "text-gray-300" : "text-gray-400"}`}>
          {isDead ? "Ended here" : isActive ? "Now" : variant === "next" ? "Next" : "Then"}
        </p>
        <p className="truncate text-lg font-semibold leading-tight text-white">
          {game.title}
        </p>
      </div>

      {(isActive || isDead) && (
        <div className="shrink-0 text-right font-mono leading-none">
          <span className={`text-[26px] font-medium ${isDead ? "text-red-300" : "text-white"}`}>
            {currentSlot}
          </span>
          <span className="text-sm text-gray-400">/{totalSlots}</span>
        </div>
      )}
    </div>
  );
}
