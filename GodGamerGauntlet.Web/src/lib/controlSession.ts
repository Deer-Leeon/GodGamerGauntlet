"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ggg-control-run-id";
const EVENT = "ggg-control-run";

export function getPinnedControlRunId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function pinControlRun(runId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, runId);
  window.dispatchEvent(new Event(EVENT));
}

export function unpinControlRun() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** The run currently pinned to the site-wide live-controls sidebar. */
export function usePinnedControlRunId(): string | null {
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setRunId(localStorage.getItem(STORAGE_KEY));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return runId;
}
