"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getOverlayState,
  sendOverlayAction,
  type OverlayAction,
  type OverlayState,
} from "@/lib/api";

const POLL_INTERVAL_MS = 2000;

export interface OverlayRun {
  state: OverlayState | null;
  /** performance.now() when `state` was received; timers extrapolate from here. */
  syncedAt: number;
  loadError: string | null;
  actionError: string | null;
  togglePlayPause: () => Promise<void>;
  split: () => Promise<void>;
  previousGame: () => Promise<void>;
  resetGauntlet: () => Promise<void>;
}

/**
 * Synchronized run state shared by /overlay/[runId] and /control/[runId].
 *
 * The server is the source of truth. Every open tab polls it, and actions
 * broadcast the fresh state over a BroadcastChannel so same-browser views
 * (e.g. control deck docked next to a preview) update instantly instead of
 * waiting out the poll interval.
 */
export function useOverlayRun(
  runId: string,
  overlayKey?: string | null,
): OverlayRun {
  const [state, setState] = useState<OverlayState | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const applyState = useCallback((next: OverlayState, broadcast: boolean) => {
    setState(next);
    setSyncedAt(performance.now());
    setLoadError(null);
    if (broadcast) {
      // The overlay key is caller-specific; never leak it across tabs.
      channelRef.current?.postMessage({ ...next, overlayKey: null });
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`ggg-overlay-${runId}`);
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<OverlayState>) => {
      // Keep our own overlayKey; the broadcast strips it.
      setState((prev) => ({
        ...event.data,
        overlayKey: prev?.overlayKey ?? null,
      }));
      setSyncedAt(performance.now());
    };
    channel.addEventListener("message", onMessage);

    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
    };
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getOverlayState(runId, overlayKey);
        if (!cancelled) applyState(next, false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load run");
        }
      }
    };

    void load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, overlayKey, applyState]);

  const act = useCallback(
    async (action: OverlayAction) => {
      try {
        const next = await sendOverlayAction(runId, action, overlayKey);
        applyState(next, true);
        setActionError(null);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Action failed",
        );
      }
    },
    [runId, overlayKey, applyState],
  );

  return {
    state,
    syncedAt,
    loadError,
    actionError,
    togglePlayPause: useCallback(() => act("toggle"), [act]),
    split: useCallback(() => act("split"), [act]),
    previousGame: useCallback(() => act("undo"), [act]),
    resetGauntlet: useCallback(() => act("reset"), [act]),
  };
}
