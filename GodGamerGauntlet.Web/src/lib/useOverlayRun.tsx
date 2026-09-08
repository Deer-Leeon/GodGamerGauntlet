"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getOverlayState,
  sendOverlayAction,
  type OverlayAction,
  type OverlayState,
} from "@/lib/api";
import {
  displayedElapsed,
  elapsedWhenAdoptingRemote,
  keepRunningClock,
  predictOverlayState,
} from "@/lib/overlayOptimistic";

const POLL_INTERVAL_MS = 1000;

function overlayShape(state: OverlayState | null): string {
  if (!state) return "";
  return JSON.stringify({
    runStatus: state.runStatus,
    timerStatus: state.timerStatus,
    currentSlotIndex: state.currentSlotIndex,
    attemptCode: state.attemptCode,
    games: state.games,
  });
}

export interface OverlayRun {
  state: OverlayState | null;
  /** performance.now() when the local clock origin was set. */
  syncedAt: number;
  loadError: string | null;
  actionError: string | null;
  togglePlayPause: () => Promise<void>;
  split: () => Promise<void>;
  previousGame: () => Promise<void>;
  resetGauntlet: () => Promise<void>;
}

/**
 * Overlay/control sync. The acting surface paints immediately (local clock);
 * the API is the ledger and is written in the background. Polls keep other
 * browsers in range; same-browser tabs still share BroadcastChannel.
 */
export function useOverlayRunSource(
  runId: string,
  overlayKey?: string | null,
): OverlayRun {
  const [state, setState] = useState<OverlayState | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef<OverlayState | null>(null);
  const syncedAtRef = useRef(0);
  const inflightRef = useRef(0);
  const frameNowRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    const loop = (now: number) => {
      frameNowRef.current = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const applyState = useCallback(
    (next: OverlayState, broadcast: boolean, keepClock = false) => {
      if (keepClock && stateRef.current) {
        next = {
          ...next,
          elapsedMs: stateRef.current.elapsedMs,
          timerStatus: stateRef.current.timerStatus,
        };
      } else {
        const now = frameNowRef.current || performance.now();
        next = {
          ...next,
          elapsedMs: elapsedWhenAdoptingRemote(
            stateRef.current,
            next,
            syncedAtRef.current,
            now,
          ),
        };
        syncedAtRef.current = now;
        setSyncedAt(now);
      }
      stateRef.current = next;
      setState(next);
      setLoadError(null);
      if (broadcast) {
        channelRef.current?.postMessage({ ...next, overlayKey: null });
      }
    },
    [],
  );

  useEffect(() => {
    if (!runId) return;
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(`ggg-overlay-${runId}`);
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<OverlayState>) => {
      if (inflightRef.current > 0) return;
      const incoming = event.data;
      setState((prev) => {
        const keepClock = keepRunningClock(prev, incoming);
        const now = frameNowRef.current || performance.now();
        const next = {
          ...incoming,
          overlayKey: prev?.overlayKey ?? null,
          elapsedMs: keepClock && prev
            ? prev.elapsedMs
            : elapsedWhenAdoptingRemote(
                prev,
                incoming,
                syncedAtRef.current,
                now,
              ),
          timerStatus:
            keepClock && prev ? prev.timerStatus : incoming.timerStatus,
        };
        stateRef.current = next;
        if (!keepClock) {
          syncedAtRef.current = now;
          setSyncedAt(now);
        }
        return next;
      });
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
      if (inflightRef.current > 0) return;
      try {
        const next = await getOverlayState(runId, overlayKey);
        if (cancelled || inflightRef.current > 0) return;
        if (stateRef.current) {
          if (overlayShape(next) === overlayShape(stateRef.current)) return;
          applyState(
            next,
            false,
            keepRunningClock(stateRef.current, next),
          );
          return;
        }
        applyState(next, false);
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
      const snapshot = stateRef.current;
      const frameNow = frameNowRef.current || performance.now();
      const predicted =
        snapshot &&
        predictOverlayState(snapshot, action, syncedAtRef.current, frameNow);
      inflightRef.current += 1;
      if (predicted) {
        applyState(predicted, true, keepRunningClock(snapshot, predicted));
      }
      try {
        const next = await sendOverlayAction(
          runId,
          action,
          overlayKey,
          snapshot
            ? displayedElapsed(snapshot, syncedAtRef.current, frameNow)
            : undefined,
        );
        applyState(next, true, keepRunningClock(snapshot, next));
        setActionError(null);
      } catch (err) {
        if (snapshot) applyState(snapshot, true);
        setActionError(err instanceof Error ? err.message : "Action failed");
      } finally {
        inflightRef.current = Math.max(0, inflightRef.current - 1);
      }
    },
    [runId, overlayKey, applyState],
  );

  const togglePlayPause = useCallback(() => act("toggle"), [act]);
  const split = useCallback(() => act("split"), [act]);
  const previousGame = useCallback(() => act("undo"), [act]);
  const resetGauntlet = useCallback(() => act("reset"), [act]);

  return {
    state,
    syncedAt,
    loadError,
    actionError,
    togglePlayPause,
    split,
    previousGame,
    resetGauntlet,
  };
}

const OverlayRunContext = createContext<{
  boundRunId: string;
  overlay: OverlayRun;
} | null>(null);

/** One overlay poller for the pinned control-deck run, shared by /run and the rail. */
export function OverlayRunProvider({
  runId,
  children,
}: {
  runId: string;
  children: ReactNode;
}) {
  const overlay = useOverlayRunSource(runId);
  const value = useMemo(
    () => ({ boundRunId: runId, overlay }),
    [runId, overlay],
  );
  return (
    <OverlayRunContext.Provider value={value}>
      {children}
    </OverlayRunContext.Provider>
  );
}

/**
 * Overlay/control sync. The acting surface paints immediately (local clock);
 * the API is the ledger and is written in the background. Polls keep other
 * browsers in range; same-browser tabs still share BroadcastChannel.
 * If this run is the pinned control-deck run, reuse that poller so /run and
 * the sidebar cannot show two different clocks.
 */
export function useOverlayRun(
  runId: string,
  overlayKey?: string | null,
): OverlayRun {
  const shared = useContext(OverlayRunContext);
  const takeShared = Boolean(
    runId && !overlayKey && shared?.boundRunId && shared.boundRunId === runId,
  );
  const local = useOverlayRunSource(takeShared ? "" : runId, overlayKey);
  return takeShared && shared ? shared.overlay : local;
}
