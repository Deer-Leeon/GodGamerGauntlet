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
  /** Stream keeps a hard outline for OBS; site matches the feed clock. */
  tone?: "stream" | "site";
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
  tone = "stream",
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

  const [mainTime, centis] = formatSpeedrunTime(displayMs).split(".");

  if (tone === "site") {
    return (
      <div
        className={`font-mono font-medium tabular-nums leading-none ${
          timerStatus === "paused" ? "text-muted" : "text-gold"
        } ${className}`}
      >
        <span>{mainTime}</span>
        <span className="text-[0.45em] font-normal text-gold/55">.{centis}</span>
      </div>
    );
  }

  // 1px black outline keeps digits readable on a transparent OBS capture.
  const looks: Record<TimerStatus, string> = {
    running: "text-white",
    paused: "text-gray-300",
    finished: "text-white",
    idle: "text-white",
  };
  const outline = "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000";

  return (
    <div
      className={`font-mono font-black tabular-nums leading-none ${looks[timerStatus]} ${className}`}
      style={{ textShadow: outline }}
    >
      <span>{mainTime}</span>
      <span className="text-[24px] font-bold">.{centis}</span>
    </div>
  );
}
