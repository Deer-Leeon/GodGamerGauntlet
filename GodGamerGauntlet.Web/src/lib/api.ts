const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const TOKEN_KEY = "ggg_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token === null) {
    window.localStorage.removeItem(TOKEN_KEY);
  } else {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  createdAt: string;
  needsUsername: boolean;
}

export interface Game {
  id: string;
  title: string;
  baseDifficulty: number;
  thumb: string | null;
  /** RAWG does not track storefront pricing, so prices may be absent. */
  normalPrice: number | null;
  salePrice: number | null;
  /** Curated competitive staple, pinned above the RAWG catalog. */
  isFeatured: boolean;
  /** Position in RAWG's most-added ordering; 0 for curated staples. */
  popularityRank: number;
}

export type RunStatus = "Active" | "Failed" | "Completed";
export type RunSlotStatus = "Pending" | "Won" | "Lost";

/** Standard is the full 10-game gauntlet; Lite is the 5-game variant. */
export type RunType = "Standard" | "Lite";

export const RUN_TYPE_SLOTS: Record<RunType, number> = {
  Standard: 10,
  Lite: 5,
};

/** Slot count for a run type, tolerant of unknown values from older payloads. */
export function slotsForRunType(runType: RunType | undefined | null): number {
  return runType ? (RUN_TYPE_SLOTS[runType] ?? RUN_TYPE_SLOTS.Standard) : RUN_TYPE_SLOTS.Standard;
}

export interface RunSlot {
  id: string;
  gameId: string;
  position: number;
  status: RunSlotStatus;
  title: string;
  thumb: string | null;
  baseDifficulty: number;
  /** Overlay clock (ms) locked in when this slot was split as beaten. */
  splitTimeMs: number | null;
}

export interface Run {
  id: string;
  userId: string;
  streamerName: string;
  startTime: string;
  endTime: string | null;
  status: RunStatus;
  runType: RunType;
  /** Games in this run: 10 for Standard, 5 for Lite. */
  totalSlots: number;
  totalDifficultyScore: number;
  /** Frozen overlay clock in ms; 0 when the run never used the timer. */
  elapsedMs: number;
  slots: RunSlot[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(readApiError(body, response));
  }

  return (await response.json()) as T;
}

function readApiError(body: string, response: Response): string {
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === "string" && parsed.trim()) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        "title" in parsed &&
        typeof parsed.title === "string"
      ) {
        return parsed.title;
      }
    } catch {
      if (body.trim()) return body;
    }
  }
  return `API request failed: ${response.status} ${response.statusText}`;
}

// ---------- Auth ----------

export interface AuthResponse {
  token: string;
  user: User;
}

export function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getMe(): Promise<User> {
  return request<User>("/api/auth/me");
}

export function changeUsername(username: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/username", {
    method: "PUT",
    body: JSON.stringify({ username }),
  });
}

export function changeEmail(
  email: string,
  currentPassword: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/email", {
    method: "PUT",
    body: JSON.stringify({ email, currentPassword }),
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

// ---------- Games & runs ----------

export function getGames(): Promise<Game[]> {
  return request<Game[]>("/api/games");
}

export interface PlayerCard {
  username: string;
  createdAt: string;
  attemptCount: number;
  clearCount: number;
  dnfCount: number;
  standardRank: number | null;
  liteRank: number | null;
  lastRunAt: string | null;
}

/** Public roster. Email is never included. */
export function getPlayers(): Promise<PlayerCard[]> {
  return request<PlayerCard[]>("/api/users");
}

/** The run is created for the authenticated user (JWT required). */
export function initializeRun(
  gameIds: string[],
  runType: RunType = "Standard",
): Promise<Run> {
  return request<Run>("/api/runs/initialize", {
    method: "POST",
    body: JSON.stringify({ gameIds, runType }),
  });
}

export interface LeaderboardEntry {
  runId: string;
  userId: string;
  streamerName: string;
  totalScore: number;
  status: "Completed" | "Failed";
  runType: RunType;
  slotsCompleted: number;
  totalSlots: number;
  endTime: string | null;
  rank: number;
}

/** Best Clear per player on one board. */
export function getLeaderboard(
  runType: RunType = "Standard",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(
    `/api/leaderboard?runType=${encodeURIComponent(runType)}&limit=${limit}`,
  );
}

export interface RunPlacement {
  runType: RunType;
  isPersonalBest: boolean;
  boardRank: number | null;
  boardSize: number;
  wouldBeRank: number | null;
  leaderScore: number;
  personalBestScore: number | null;
  personalBestRunId: string | null;
  personalBestRank: number | null;
}

export function getPlacement(runId: string): Promise<RunPlacement> {
  return request<RunPlacement>(`/api/runs/${runId}/placement`);
}

export interface ProfileBoard {
  rank: number;
  score: number;
  runId: string;
  boardSize: number;
}

export interface ProfileRun {
  runId: string;
  status: "Completed" | "Failed";
  runType: RunType;
  endTime: string | null;
  totalScore: number;
  slotsCompleted: number;
  totalSlots: number;
  boardRank: number | null;
  wouldBeRank: number | null;
}

export interface ProfileMode {
  attempts: number;
  clears: number;
  dnfs: number;
  gamesBeaten: number;
  bestSurvival: number;
  bestSurvivalTotal: number;
  personalBest: ProfileBoard | null;
}

export interface UserProfile {
  id: string;
  username: string;
  createdAt: string;
  lastRunAt: string | null;
  attemptCount: number;
  clearCount: number;
  dnfCount: number;
  gamesBeaten: number;
  standard: ProfileMode;
  lite: ProfileMode;
  runs: ProfileRun[];
}

export function getProfile(username: string): Promise<UserProfile> {
  return request<UserProfile>(
    `/api/users/by-username/${encodeURIComponent(username)}`,
  );
}

export function getRun(id: string): Promise<Run> {
  return request<Run>(`/api/runs/${id}`);
}

export function reportSlotMatch(
  id: string,
  position: number,
  result: "Won" | "Lost",
): Promise<Run> {
  return request<Run>(`/api/runs/${id}/report`, {
    method: "POST",
    body: JSON.stringify({ slotPosition: position, result }),
  });
}

// ---------- OBS overlay & control deck ----------

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export interface OverlaySlot {
  gameId: string;
  slotNumber: number;
  title: string;
  thumb: string | null;
  baseDifficulty: number;
  completed: boolean;
  splitTimeMs: number | null;
}

export interface OverlayState {
  runId: string;
  streamerName: string;
  runStatus: RunStatus;
  runType: RunType;
  currentSlotIndex: number;
  timerStatus: TimerStatus;
  elapsedMs: number;
  games: OverlaySlot[];
  /** Only present when the caller is the run owner. */
  overlayKey: string | null;
}

export type OverlayAction = "toggle" | "split" | "undo" | "reset";

function overlayQuery(key?: string | null): string {
  return key ? `?key=${encodeURIComponent(key)}` : "";
}

export function getOverlayState(
  runId: string,
  key?: string | null,
): Promise<OverlayState> {
  return request<OverlayState>(`/api/runs/${runId}/overlay${overlayQuery(key)}`);
}

export function sendOverlayAction(
  runId: string,
  action: OverlayAction,
  key?: string | null,
): Promise<OverlayState> {
  return request<OverlayState>(
    `/api/runs/${runId}/overlay/${action}${overlayQuery(key)}`,
    { method: "POST" },
  );
}

// ---------- Community feed ----------

export type FeedSort = "hot" | "new" | "top";

export type ReactionType = "fire" | "skull" | "crown" | "gg";

export interface FeedPost {
  runId: string;
  userId: string;
  streamerName: string;
  status: "Completed" | "Failed";
  runType: RunType;
  endTime: string | null;
  totalScore: number;
  slotsCompleted: number;
  totalSlots: number;
  slotStatuses: RunSlotStatus[];
  slotTitles: string[];
  slotThumbs: (string | null)[];
  /** Frozen overlay clock in ms; 0 when the run never used the timer. */
  elapsedMs: number;
  /** Cumulative split clock per slot, parallel to slotTitles. */
  slotSplitTimes: (number | null)[];
  voteScore: number;
  myVote: number;
  commentCount: number;
  reactions: Record<string, number>;
  myReactions: string[];
  boardRank: number | null;
  wouldBeRank: number | null;
}

export interface FeedPage {
  posts: FeedPost[];
  page: number;
  hasMore: boolean;
}

export function getFeed(sort: FeedSort, page: number): Promise<FeedPage> {
  return request<FeedPage>(`/api/feed?sort=${sort}&page=${page}`);
}

export function getFeedPost(runId: string): Promise<FeedPost> {
  return request<FeedPost>(`/api/runs/${runId}/post`);
}

export interface VoteResult {
  voteScore: number;
  myVote: number;
}

export function voteOnRun(runId: string, value: -1 | 0 | 1): Promise<VoteResult> {
  return request<VoteResult>(`/api/runs/${runId}/vote`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export interface ReactionsResult {
  reactions: Record<string, number>;
  myReactions: string[];
}

export function toggleReaction(
  runId: string,
  type: ReactionType,
): Promise<ReactionsResult> {
  return request<ReactionsResult>(`/api/runs/${runId}/reactions/toggle`, {
    method: "POST",
    body: JSON.stringify({ type }),
  });
}

export interface RunComment {
  id: string;
  userId: string;
  username: string;
  body: string;
  createdAt: string;
}

export function getComments(runId: string): Promise<RunComment[]> {
  return request<RunComment[]>(`/api/runs/${runId}/comments`);
}

export function addComment(runId: string, body: string): Promise<RunComment> {
  return request<RunComment>(`/api/runs/${runId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function editComment(
  runId: string,
  commentId: string,
  body: string,
): Promise<RunComment> {
  return request<RunComment>(`/api/runs/${runId}/comments/${commentId}`, {
    method: "PUT",
    body: JSON.stringify({ body }),
  });
}

export async function deleteComment(
  runId: string,
  commentId: string,
): Promise<void> {
  const token = getToken();
  const response = await fetch(
    `${API_URL}/api/runs/${runId}/comments/${commentId}`,
    {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      body || `API request failed: ${response.status} ${response.statusText}`,
    );
  }
}
