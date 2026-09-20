import {
  RUN_TYPE_SLOTS,
  isLiveRunType,
  type Game,
  type RunType,
} from "@/lib/api";

const KEY = "ggg_draft_lineup";

export interface SavedDraftLineup {
  runType: RunType;
  gameIds: (string | null)[];
}

export function saveDraftLineup(runType: RunType, slots: (Game | null)[]): void {
  if (typeof window === "undefined") return;
  const payload: SavedDraftLineup = {
    runType,
    gameIds: slots.map((game) => game?.id ?? null),
  };
  window.sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadDraftLineup(): SavedDraftLineup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedDraftLineup;
    if (!isLiveRunType(parsed.runType) || !Array.isArray(parsed.gameIds)) {
      return null;
    }
    const size = RUN_TYPE_SLOTS[parsed.runType];
    return {
      runType: parsed.runType,
      gameIds: parsed.gameIds.slice(0, size),
    };
  } catch {
    return null;
  }
}

export function clearDraftLineup(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}

export function restoreDraftSlots(
  games: Game[],
  saved: SavedDraftLineup,
): (Game | null)[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  const size = RUN_TYPE_SLOTS[saved.runType];
  return Array.from({ length: size }, (_, i) => {
    const id = saved.gameIds[i];
    return id ? (byId.get(id) ?? null) : null;
  });
}
