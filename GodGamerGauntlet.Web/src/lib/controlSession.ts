"use client";

import { useSyncExternalStore } from "react";

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

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

/** The run currently pinned to the site-wide live-controls sidebar. */
export function usePinnedControlRunId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
