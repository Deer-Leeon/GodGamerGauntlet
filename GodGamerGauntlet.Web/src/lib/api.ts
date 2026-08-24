const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

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
  normalPrice: number;
  salePrice: number;
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
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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

export function getGames(): Promise<Game[]> {
  return request<Game[]>("/api/games");
}

export function getUsers(): Promise<User[]> {
  return request<User[]>("/api/users");
}

export function initializeRun(
  userId: string,
  gameIds: string[],
): Promise<Run> {
  return request<Run>("/api/runs/initialize", {
    method: "POST",
    body: JSON.stringify({ userId, gameIds }),
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
