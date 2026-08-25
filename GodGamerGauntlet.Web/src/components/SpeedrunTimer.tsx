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

  // 1px black outline keeps digits readable without a soft glow bloom.
  const looks: Record<TimerStatus, { classes: string; outline: string }> = {
    running: {
      classes: "text-[#00ff66]",
      outline: "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000",
    },
    paused: {
      classes: "text-[#facc15]",
      outline: "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000",
    },
    finished: {
      classes: "text-accent-streak",
      outline: "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000",
    },
    idle: {
      classes: "text-[#00ff66]",
      outline: "0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000",
    },
  };
  const look = looks[timerStatus];

  const [mainTime, centis] = formatSpeedrunTime(displayMs).split(".");

  return (
    <div
      className={`font-mono font-black tabular-nums leading-none ${look.classes} ${className}`}
      style={{ textShadow: look.outline }}
    >
      <span>{mainTime}</span>
      <span className="text-[24px] font-bold">.{centis}</span>
    </div>
  );
}
