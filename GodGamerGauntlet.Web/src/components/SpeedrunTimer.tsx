"use client";

import { useEffect, useState } from "react";
import type { TimerStatus } from "@/lib/api";

/** H:MM:SS.cc — e.g. 1:02:15.63 */
export function formatSpeedrunTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const centis = Math.floor(clamped / 10) % 100;
  const seconds = Math.floor(clamped / 1000) % 60;
  const minutes = Math.floor(clamped / 60_000) % 60;
  const hours = Math.floor(clamped / 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

interface SpeedrunTimerProps {
  /** Server-reported elapsed ms at the moment of the last sync. */
  elapsedMs: number;
  timerStatus: TimerStatus;
  /** performance.now() at the moment of the last sync. */
  syncedAt: number;
  className?: string;
}

/**
 * Self-ticking display so only this component re-renders ~30fps.
 * While running, elapsed extrapolates locally from the last server sync.
 */
export default function SpeedrunTimer({
  elapsedMs,
  timerStatus,
  syncedAt,
  className = "",
}: SpeedrunTimerProps) {
  // The interval only records the current tick; the displayed value is derived
  // during render, keeping the component pure for the react-hooks lint rules.
  const [tickNow, setTickNow] = useState<number | null>(null);

  useEffect(() => {
    if (timerStatus !== "running") return;
    const timer = setInterval(() => setTickNow(performance.now()), 33);
    return () => clearInterval(timer);
  }, [timerStatus]);

  const displayMs =
    timerStatus === "running" && tickNow !== null && tickNow > syncedAt
      ? elapsedMs + (tickNow - syncedAt)
      : elapsedMs;

  // Layered glow: a tight halo for crispness plus a wide soft bloom.
  const looks: Record<TimerStatus, { classes: string; glow: string }> = {
    running: {
      classes: "text-[#00ff66]",
      glow: "drop-shadow(0 0 4px rgba(0,255,102,0.85)) drop-shadow(0 0 20px rgba(0,255,102,0.35))",
    },
    paused: {
      classes: "animate-pulse text-[#facc15]",
      glow: "drop-shadow(0 0 4px rgba(250,204,21,0.8)) drop-shadow(0 0 18px rgba(250,204,21,0.3))",
    },
    finished: {
      classes: "text-accent-streak",
      glow: "drop-shadow(0 0 4px rgba(255,192,0,0.85)) drop-shadow(0 0 20px rgba(255,192,0,0.35))",
    },
    idle: {
      classes: "text-[#00ff66]/70",
      glow: "drop-shadow(0 0 10px rgba(0,255,102,0.25))",
    },
  };
  const look = looks[timerStatus];

  const [mainTime, centis] = formatSpeedrunTime(displayMs).split(".");

  return (
    <div
      className={`font-mono font-black tabular-nums leading-none transition-colors duration-300 ${look.classes} ${className}`}
      style={{ filter: look.glow }}
    >
      <span className="tracking-[-0.04em]">{mainTime}</span>
      <span className="text-[0.52em] font-bold opacity-90">.{centis}</span>
    </div>
  );
}
