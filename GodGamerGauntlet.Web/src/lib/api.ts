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
  createdAt: string;
}

export interface Game {
  id: string;
  title: string;
  baseDifficulty: number;
  thumb: string | null;
  /** RAWG does not track storefront pricing, so prices may be absent. */
  normalPrice: number | null;
  salePrice: number | null;
}

export type RunStatus = "Active" | "Failed" | "Completed";
export type RunSlotStatus = "Pending" | "Won" | "Lost";

export interface RunSlot {
  id: string;
  gameId: string;
  position: number;
  status: RunSlotStatus;
}

export interface Run {
  id: string;
  userId: string;
  startTime: string;
  endTime: string | null;
  status: RunStatus;
  totalDifficultyScore: number;
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
    throw new Error(
      body || `API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

// ---------- Auth ----------

export interface AuthResponse {
  token: string;
  user: User;
}

export function register(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
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

// ---------- Games & runs ----------

export function getGames(): Promise<Game[]> {
  return request<Game[]>("/api/games");
}

export function getUsers(): Promise<User[]> {
  return request<User[]>("/api/users");
}

/** The run is created for the authenticated user (JWT required). */
export function initializeRun(gameIds: string[]): Promise<Run> {
  return request<Run>("/api/runs/initialize", {
    method: "POST",
    body: JSON.stringify({ gameIds }),
  });
}

export interface LeaderboardEntry {
  runId: string;
  streamerName: string;
  totalScore: number;
  status: "Completed" | "Failed";
  slotsCompleted: number;
  endTime: string | null;
}

export function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>("/api/leaderboard");
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

// ---------- Community feed ----------

export type FeedSort = "hot" | "new" | "top";

export type ReactionType = "fire" | "skull" | "crown" | "gg";

export interface FeedPost {
  runId: string;
  userId: string;
  streamerName: string;
  status: "Completed" | "Failed";
  endTime: string | null;
  totalScore: number;
  slotsCompleted: number;
  slotStatuses: RunSlotStatus[];
  voteScore: number;
  myVote: number;
  commentCount: number;
  reactions: Record<string, number>;
  myReactions: string[];
}

export interface FeedPage {
  posts: FeedPost[];
  page: number;
  hasMore: boolean;
}

export function getFeed(sort: FeedSort, page: number): Promise<FeedPage> {
  return request<FeedPage>(`/api/feed?sort=${sort}&page=${page}`);
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
