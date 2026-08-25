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

  const statusStyle =
    timerStatus === "running"
      ? "text-[#00ff66] drop-shadow-[0_0_14px_rgba(0,255,102,0.55)]"
      : timerStatus === "paused"
        ? "animate-pulse text-[#facc15] drop-shadow-[0_0_12px_rgba(250,204,21,0.45)]"
        : timerStatus === "finished"
          ? "text-accent-streak drop-shadow-[0_0_14px_rgba(255,192,0,0.55)]"
          : "text-[#00ff66]/50";

  return (
    <div
      className={`font-mono font-black tracking-tight tabular-nums transition-colors duration-300 ${statusStyle} ${className}`}
    >
      {formatSpeedrunTime(displayMs)}
    </div>
  );
}
