import type { OverlayAction, OverlayState, RunSlotStatus } from "@/lib/api";

/** Elapsed ms the streamer currently sees, including local extrapolation. */
export function displayedElapsed(
  state: OverlayState,
  syncedAt: number,
  now = typeof performance !== "undefined" ? performance.now() : 0,
): number {
  if (state.timerStatus === "running" && syncedAt > 0) {
    return Math.max(0, state.elapsedMs + (now - syncedAt));
  }
  return state.elapsedMs;
}

/**
 * Predicted overlay state so start/split paint before the API round-trip.
 * Returns null when the action is a no-op (still POST; do not paint).
 */
export function predictOverlayState(
  state: OverlayState,
  action: OverlayAction,
  syncedAt: number,
  now?: number,
): OverlayState | null {
  const elapsedMs = displayedElapsed(state, syncedAt, now);
  const games = state.games.map((game) => ({ ...game }));

  switch (action) {
    case "toggle": {
      if (state.timerStatus === "finished") return null;
      if (state.timerStatus === "running") {
        return { ...state, timerStatus: "paused", elapsedMs };
      }
      return { ...state, timerStatus: "running", elapsedMs };
    }
    case "split": {
      if (state.runStatus !== "Active") return null;
      const idx = games.findIndex((game) => !game.completed);
      if (idx < 0) return null;
      games[idx] = {
        ...games[idx],
        completed: true,
        splitTimeMs: elapsedMs,
        status: "Won" as RunSlotStatus,
      };
      const last = idx === games.length - 1;
      return {
        ...state,
        games,
        currentSlotIndex: last ? idx : idx + 1,
        // Keep the running origin. Only freeze elapsed when the gauntlet ends.
        elapsedMs: last ? elapsedMs : state.elapsedMs,
        timerStatus: last ? "finished" : state.timerStatus,
        runStatus: last ? "Completed" : state.runStatus,
      };
    }
    case "undo": {
      let lastIdx = -1;
      for (let i = games.length - 1; i >= 0; i--) {
        const slot = games[i];
        if (slot.completed || (slot.status && slot.status !== "Pending")) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx < 0) return null;
      games[lastIdx] = {
        ...games[lastIdx],
        completed: false,
        splitTimeMs: null,
        status: "Pending",
      };
      const reopen = state.timerStatus === "finished";
      return {
        ...state,
        games,
        currentSlotIndex: lastIdx,
        runStatus: "Active",
        timerStatus: reopen ? "paused" : state.timerStatus,
        elapsedMs: reopen ? elapsedMs : state.elapsedMs,
      };
    }
    case "reset":
      return {
        ...state,
        runStatus: "Active",
        timerStatus: "idle",
        elapsedMs: 0,
        currentSlotIndex: 0,
        games: games.map((game) => ({
          ...game,
          completed: false,
          splitTimeMs: null,
          status: "Pending" as RunSlotStatus,
        })),
      };
  }
}
