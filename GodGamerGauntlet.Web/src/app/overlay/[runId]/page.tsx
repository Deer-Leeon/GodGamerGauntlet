"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { slotsForRunType, type OverlaySlot } from "@/lib/api";
import { useOverlayRun } from "@/lib/useOverlayRun";
import { useOverlayHotkeys } from "@/lib/useOverlayHotkeys";
import SpeedrunTimer from "@/components/SpeedrunTimer";

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
      className="obs-overlay-root relative flex flex-col gap-2 overflow-hidden p-2"
      style={{ width: OVERLAY_W, height: OVERLAY_H, zoom: scale }}
    >
      {aspectOff && (
        <div className="rounded bg-accent-death px-2 py-1 font-heading text-[11px] font-bold leading-tight text-white">
          Wrong source shape. Double-click the Browser source and set Height to{" "}
          {Math.round(OVERLAY_H * scale)} (keep Width as is). Recommended: 840 ×
          680.
        </div>
      )}

      <GameWheel
        games={state.games}
        currentIndex={state.currentSlotIndex}
        totalSlots={totalCount}
      />

      <div
        className="mt-auto w-full rounded-lg border border-white/20 px-4 py-2"
        style={{ background: "rgba(8,11,22,0.96)" }}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-heading text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
            Gauntlet Time
            {isLite && (
              <span
                className="rounded px-1.5 py-px text-[10px] tracking-[0.12em] text-[#00e5ff]"
                style={{ background: "rgba(0,229,255,0.16)" }}
              >
                Lite
              </span>
            )}
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
  totalSlots,
}: {
  games: OverlaySlot[];
  currentIndex: number;
  totalSlots: number;
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
