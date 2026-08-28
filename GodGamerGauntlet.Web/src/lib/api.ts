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
  /** Global admin: moderates every records board and manages moderator rosters. */
  isAdmin?: boolean;
  /** Has at least one per-game moderator assignment. */
  isModerator?: boolean;
  /** Public avatar image URL, shown on profiles and live-now cards. */
  avatarUrl?: string | null;
  streamLinks?: StreamLink[];
}

export type StreamPlatform = "twitch" | "youtube";

export interface StreamLink {
  platform: StreamPlatform;
  url: string;
  label: string;
}

export interface StreamLinkInput {
  platform: StreamPlatform;
  url: string;
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
export type TimerStatus = "idle" | "running" | "paused" | "finished";

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
  /** Present on live runs so the client can keep ticking. */
  timerStatus?: TimerStatus;
  slots: RunSlot[];
  streamLinks?: StreamLink[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "Couldn't reach the server. Wait a few seconds and try again.",
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(readApiError(body, response));
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function readApiError(body: string, response: Response): string {
  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed === "string" && parsed.trim()) return parsed;
      if (parsed && typeof parsed === "object") {
        if (
          "detail" in parsed &&
          typeof parsed.detail === "string" &&
          parsed.detail.trim()
        ) {
          return parsed.detail;
        }
        if ("title" in parsed && typeof parsed.title === "string") {
          return parsed.title;
        }
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

export function changeStreamLinks(
  links: StreamLinkInput[],
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/stream-links", {
    method: "PUT",
    body: JSON.stringify({ links }),
  });
}

/** Profile appearance (avatar). Blank/null clears it. */
export function updateProfile(
  avatarUrl: string | null,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/users/me/profile", {
    method: "PUT",
    body: JSON.stringify({ avatarUrl }),
  });
}

// ---------- Games & runs ----------

export function getGames(): Promise<Game[]> {
  return request<Game[]>("/api/games");
}

/** One homepage "Live Now" card: a gauntlet with a running timer. */
export interface LiveRunCard {
  runId: string;
  username: string;
  avatarUrl: string | null;
  streamUrl: string | null;
  runType: RunType;
  slotsCompleted: number;
  totalSlots: number;
  currentTitle: string | null;
  currentThumb: string | null;
  elapsedMs: number;
}

/** Public: gauntlets whose timer is running right now, most recent first. */
export function getLiveRuns(): Promise<LiveRunCard[]> {
  return request<LiveRunCard[]>("/api/runs/live");
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

/** One slot of a drafted gauntlet, for the arena's inspect-wheel modal. */
export interface ArenaSlot {
  position: number;
  title: string;
  thumb: string | null;
  baseDifficulty: number;
  status: "Pending" | "Won" | "Lost";
  splitTimeMs: number | null;
}

export interface LeaderboardEntry {
  runId: string;
  userId: string;
  streamerName: string;
  avatarUrl: string | null;
  totalScore: number;
  status: "Completed" | "Failed";
  runType: RunType;
  slotsCompleted: number;
  totalSlots: number;
  /** Gauntlet clock at the finish; 0 when the timer was never used. */
  elapsedMs: number;
  endTime: string | null;
  rank: number;
  games: ArenaSlot[];
}

/** Best Clear per player on one board. */
export function getLeaderboard(
  runType: RunType = "Standard",
  limit = 50,
  season: "all" | "current" | string = "all",
): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(
    `/api/leaderboard?runType=${encodeURIComponent(runType)}&limit=${limit}&season=${encodeURIComponent(season)}`,
  );
}

export function getSurvivalBoard(
  runType: RunType = "Standard",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(
    `/api/leaderboard/survival?runType=${encodeURIComponent(runType)}&limit=${limit}`,
  );
}

export interface SeasonChampion {
  season: string;
  label: string;
  standard: LeaderboardEntry | null;
  lite: LeaderboardEntry | null;
}

export function getHallOfFame(): Promise<SeasonChampion[]> {
  return request<SeasonChampion[]>("/api/leaderboard/seasons");
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
  recapTitle: string;
  nextRank: number | null;
  pointsToNext: number | null;
  nextUsername: string | null;
}

export function getPlacement(runId: string): Promise<RunPlacement> {
  return request<RunPlacement>(`/api/runs/${runId}/placement`);
}

export interface ProfileBoard {
  rank: number;
  score: number;
  runId: string;
  boardSize: number;
  nextRank: number | null;
  pointsToNext: number | null;
  nextUsername: string | null;
}

export interface ProfileGame {
  gameId: string;
  title: string;
  thumb: string | null;
  count: number;
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
  elapsedMs: number;
  slotStatuses: RunSlotStatus[];
  slotTitles: string[];
  slotThumbs: (string | null)[];
  moments?: string[];
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
  avatarUrl: string | null;
  createdAt: string;
  lastRunAt: string | null;
  attemptCount: number;
  clearCount: number;
  dnfCount: number;
  gamesBeaten: number;
  title: string | null;
  titles: string[];
  beaten: ProfileGame[];
  killers: ProfileGame[];
  standard: ProfileMode;
  lite: ProfileMode;
  runs: ProfileRun[];
  streamLinks?: StreamLink[];
  live?: ProfileLiveRun | null;
  isFollowing?: boolean;
}

export interface ProfileLiveRun {
  runId: string;
  runType: RunType;
  slotsCompleted: number;
  totalSlots: number;
  currentSlot: number;
  currentTitle: string | null;
  currentThumb: string | null;
  timerStatus?: TimerStatus;
  elapsedMs?: number;
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

export interface OverlaySlot {
  gameId: string;
  slotNumber: number;
  title: string;
  thumb: string | null;
  baseDifficulty: number;
  completed: boolean;
  splitTimeMs: number | null;
  status?: RunSlotStatus;
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
  reactions?: Record<string, number>;
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
  status: RunStatus;
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
  moments?: string[];
}

export interface LiveRun {
  runId: string;
  userId?: string;
  streamerName: string;
  runType: RunType;
  slotsCompleted: number;
  totalSlots: number;
  currentSlot: number;
  currentTitle: string | null;
  currentThumb: string | null;
  streamLinks?: StreamLink[];
}

export interface SidebarFollowed {
  username: string;
  live: LiveRun | null;
}

export interface Sidebar {
  followed: SidebarFollowed[];
  live: LiveRun[];
  bestRuns: LiveRun[];
}

export function getSidebar(): Promise<Sidebar> {
  return request<Sidebar>("/api/sidebar");
}

export function followUser(username: string): Promise<void> {
  return request<void>(
    `/api/users/by-username/${encodeURIComponent(username)}/follow`,
    { method: "POST" },
  );
}

export function unfollowUser(username: string): Promise<void> {
  return request<void>(
    `/api/users/by-username/${encodeURIComponent(username)}/follow`,
    { method: "DELETE" },
  );
}

export interface FeedPage {
  posts: FeedPost[];
  page: number;
  hasMore: boolean;
  live: LiveRun[];
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

// ── Catalog directory (server-paginated; Draft Room keeps its client search) ─

export interface CatalogPage {
  items: Game[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export function getCatalog(
  search: string,
  page: number,
  pageSize = 40,
): Promise<CatalogPage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search.trim()) params.set("search", search.trim());
  return request<CatalogPage>(`/api/catalog?${params.toString()}`);
}

// ── Speedrun Records (verified ledger) ──────────────────────────────────────

export interface RecordsValue {
  id: string;
  value: string;
}

export interface RecordsVariable {
  id: string;
  name: string;
  isSubcategory: boolean;
  isRequired: boolean;
  values: RecordsValue[];
}

export interface RecordsCategory {
  id: string;
  name: string;
  rules: string | null;
  variables: RecordsVariable[];
}

export interface GameModeratorInfo {
  userId: string;
  username: string;
  assignedAt: string;
}

export interface GameRecords {
  gameId: string;
  title: string;
  thumb: string | null;
  categories: RecordsCategory[];
  moderators: GameModeratorInfo[];
}

export interface SubmissionVariableTag {
  variableValueId: string;
  variableName: string;
  value: string;
  isSubcategory: boolean;
}

export interface RecordRow {
  rank: number;
  submissionId: string;
  playerId: string;
  playerName: string;
  primaryTimeMs: number;
  playedOn: string;
  isEmulator: boolean;
  videoUrl: string;
  examinerName: string | null;
  variables: SubmissionVariableTag[];
}

export type SubmissionStatus = "Pending" | "Verified" | "Rejected";

export interface Submission {
  id: string;
  gameId: string;
  gameTitle: string;
  categoryId: string;
  categoryName: string;
  playerId: string;
  playerName: string;
  primaryTimeMs: number;
  videoUrl: string;
  playedOn: string;
  isEmulator: boolean;
  status: SubmissionStatus;
  isObsolete: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  examinerName: string | null;
  rejectReason: string | null;
  variables: SubmissionVariableTag[];
}

export interface ModQueueItem {
  submissionId: string;
  gameId: string;
  gameTitle: string;
  categoryName: string;
  playerId: string;
  playerName: string;
  playerJoined: string;
  primaryTimeMs: number;
  videoUrl: string;
  playedOn: string;
  isEmulator: boolean;
  submittedAt: string;
  variables: SubmissionVariableTag[];
}

export function getGameRecords(gameId: string): Promise<GameRecords> {
  return request<GameRecords>(`/api/games/${gameId}/records`);
}

export function getRecordsBoard(
  gameId: string,
  categoryId: string,
  variableValueIds: string[],
): Promise<RecordRow[]> {
  const values = variableValueIds.length
    ? `?values=${variableValueIds.join(",")}`
    : "";
  return request<RecordRow[]>(
    `/api/games/${gameId}/categories/${categoryId}/leaderboard${values}`,
  );
}

export interface SubmitRunInput {
  gameId: string;
  categoryId: string;
  primaryTimeMs: number;
  videoUrl: string;
  playedOn: string;
  isEmulator: boolean;
  variableValueIds: string[];
}

export function submitRun(input: SubmitRunInput): Promise<Submission> {
  return request<Submission>("/api/submissions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSubmission(id: string): Promise<Submission> {
  return request<Submission>(`/api/submissions/${id}`);
}

/** A player's current verified PBs (public trophy room), newest first. */
export function getUserSpeedruns(username: string): Promise<Submission[]> {
  return request<Submission[]>(
    `/api/users/by-username/${encodeURIComponent(username)}/speedruns`,
  );
}

/** The caller's pending submissions and rejections (with examiner reasons). */
export function getMyPendingRuns(): Promise<Submission[]> {
  return request<Submission[]>("/api/users/me/pending-runs");
}

// ── Notifications (Records Phase 7) ─────────────────────────────────────────

export interface AppNotification {
  id: string;
  message: string;
  actionUrl: string;
  isRead: boolean;
  createdAt: string;
}

/** The caller's inbox, newest first (capped at 50 server-side). */
export function getNotifications(): Promise<AppNotification[]> {
  return request<AppNotification[]>("/api/notifications");
}

export function markNotificationRead(id: string): Promise<void> {
  return request<void>(`/api/notifications/${id}/read`, { method: "PUT" });
}

export function getModQueue(): Promise<ModQueueItem[]> {
  return request<ModQueueItem[]>("/api/moderation/queue");
}

export function reviewSubmission(
  id: string,
  action: "Verify" | "Reject",
  rejectReason?: string,
): Promise<Submission> {
  return request<Submission>(`/api/submissions/${id}/review`, {
    method: "POST",
    body: JSON.stringify({ action, rejectReason }),
  });
}

// ── Board management (admins + game moderators) ─────────────────────────────

export interface SaveCategoryInput {
  name: string;
  rules: string | null;
}

export function createCategory(
  gameId: string,
  input: SaveCategoryInput,
): Promise<RecordsCategory> {
  return request<RecordsCategory>(`/api/games/${gameId}/categories`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCategory(
  categoryId: string,
  input: SaveCategoryInput,
): Promise<RecordsCategory> {
  return request<RecordsCategory>(`/api/categories/${categoryId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export interface CreateVariableInput {
  name: string;
  isSubcategory: boolean;
  isRequired: boolean;
}

export function createVariable(
  categoryId: string,
  input: CreateVariableInput,
): Promise<RecordsVariable> {
  return request<RecordsVariable>(`/api/categories/${categoryId}/variables`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createVariableValue(
  variableId: string,
  value: string,
): Promise<RecordsValue> {
  return request<RecordsValue>(`/api/variables/${variableId}/values`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

export function getGameModerators(
  gameId: string,
): Promise<GameModeratorInfo[]> {
  return request<GameModeratorInfo[]>(
    `/api/moderation/games/${gameId}/moderators`,
  );
}

export function assignModerator(
  gameId: string,
  username: string,
): Promise<void> {
  return request<void>(`/api/moderation/games/${gameId}/moderators`, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function removeModerator(
  gameId: string,
  userId: string,
): Promise<void> {
  return request<void>(`/api/moderation/games/${gameId}/moderators/${userId}`, {
    method: "DELETE",
  });
}

/** Can this user open /records/[gameId]/manage? Server enforces regardless. */
export function canManageBoard(
  user: User | null,
  moderators: GameModeratorInfo[],
): boolean {
  if (!user) return false;
  return Boolean(user.isAdmin) || moderators.some((m) => m.userId === user.id);
}

/** Mirrors the API's proof-link rule so the form can validate before posting. */
export function isValidProofUrl(url: string): boolean {
  return /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|live\/|shorts\/)|youtu\.be\/|twitch\.tv\/(videos\/\d+|\w+\/(v|video)\/\d+|\w+\/clip\/)|clips\.twitch\.tv\/)\S+$/i.test(
    url.trim(),
  );
}

/** 5384210 → "1:29:44.210"; hours are omitted when zero. */
export function formatRecordTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor(ms % 1000);
  const millisPart = millis > 0 ? `.${String(millis).padStart(3, "0")}` : "";
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${millisPart}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}${millisPart}`;
}

/** "1:29:44.210", "29:44", "95.5" → milliseconds; null when unparseable. */
export function parseRecordTime(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const match = /^(?:(\d{1,3}):)?(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(
    trimmed,
  );
  if (!match) return null;

  const [, first, second, secondsRaw, millisRaw] = match;
  // One colon → M:SS (first fills, second is empty); two → H:MM:SS.
  const hours = second !== undefined ? Number(first ?? 0) : 0;
  const minutes = second !== undefined ? Number(second) : Number(first ?? 0);
  const seconds = Number(secondsRaw);
  const millis = millisRaw ? Number(millisRaw.padEnd(3, "0")) : 0;

  if (minutes > 59 || seconds > 59) return null;
  const total =
    hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + millis;
  return total > 0 ? total : null;
}
