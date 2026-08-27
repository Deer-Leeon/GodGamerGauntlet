# PROJECT_STATE.md — GodGamerGauntlet Backend Ledger

> Living documentation for the godgamergauntlet.com backend. Update this file whenever the schema, API surface, or deployment story changes.
>
> **Last updated:** 2026-08-27 (Records Phase 1 — Speedrun Trust Schema: categories, variables, verified VOD submissions)

---

## 1. System Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 8 (ASP.NET Core Web API, controller-based) |
| ORM | Entity Framework Core 8 (code-first migrations) |
| Database | PostgreSQL (Npgsql.EntityFrameworkCore.PostgreSQL 8) |
| API Docs | Swagger / Swashbuckle (Development environment only, at `/swagger`) |
| Hosting target | Railway (API + managed PostgreSQL) |
| Frontend | Next.js 16 (App Router, TypeScript, Turbopack) in `GodGamerGauntlet.Web/`, deployed to Vercel |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens — no `tailwind.config.ts`) |
| Fonts | Space Grotesk (headings), JetBrains Mono (data/scores), Inter (body) via `next/font/google` |

### Architectural pattern

Controller → Repository → `AppDbContext` → PostgreSQL. Controllers hold request validation and business orchestration; repositories own all database access behind interfaces (`IGameRepository`, `IRunRepository`, `IUserRepository`) registered as scoped services. DTO records in `Contracts/` decouple the wire format from EF entities. (`FeedController` uses `AppDbContext` directly, like `AdminController` — the feed aggregation queries don't fit the entity-repository shape.)

**Authentication (Phase 7):** stateless JWT Bearer. `AuthController` issues 30-day HS256 tokens (`JwtTokenService`); passwords are hashed with `PasswordHasher<User>` (`Microsoft.Extensions.Identity.Core` — no full ASP.NET Identity). The signing key derives from config key **`Jwt:Secret`** via SHA-256 (guaranteeing a 256-bit key); when the secret is missing, the app logs a warning and falls back to a **random per-boot key**, which keeps the API up but invalidates every session on restart. Claims: `ClaimTypes.NameIdentifier` (user id) + `ClaimTypes.Name` (username). Pipeline: `UseAuthentication()` before `UseAuthorization()`.

### Project layout

```
GodGamerGauntlet.Api/
├── Contracts/          # DTO records (Auth, Feed, Game, Overlay, Run, User)
├── Controllers/        # Auth, Feed, Game, Overlay, Run, User, Admin, Leaderboard
├── Data/               # AppDbContext, DbInitializer (auto-migrate + seed)
├── Migrations/         # EF Core migrations
├── Models/             # User, Game, Run, RunSlot, RunVote, RunComment, RunReaction + enums
├── Repositories/       # Interfaces + EF implementations
├── Services/           # RawgClient, GameSync*, JwtTokenService, OverlayKeys
├── Program.cs          # DI, CORS, JWT auth, startup migration/seeding, pipeline
└── appsettings.json    # ConnectionStrings:DefaultConnection, RawgApiKey, Jwt:Secret

GodGamerGauntlet.Web/
├── .env.local          # NEXT_PUBLIC_API_URL (gitignored; localhost:5000 or Railway URL)
└── src/
    ├── app/
    │   ├── globals.css      # Tailwind v4 @theme design tokens + panel utility + obs-overlay transparency
    │   ├── layout.tsx       # Fonts, metadata, AuthProvider + SiteNav wrap
    │   ├── page.tsx         # Community feed (Hot/New/Top, votes, reactions, comments)
    │   ├── login/page.tsx   # Sign in / create account
    │   ├── draft/page.tsx   # The Draft Room (client component)
    │   ├── run/[id]/        # Live run tracker
    │   ├── overlay/[runId]/ # OBS browser-source overlay (3D wheel + speedrun timer + hotkeys)
    │   ├── control/[runId]/ # Streamer control deck (Play/Pause, Split, Undo, Reset)
    │   └── leaderboard/     # Global leaderboard
    ├── components/
    │   ├── SiteNav.tsx        # Shared nav header with auth state (hidden on /overlay)
    │   ├── RunSocial.tsx      # Vote column, reaction bar, comment thread (feed + run page)
    │   └── SpeedrunTimer.tsx  # Self-ticking H:MM:SS.cc timer display + formatter
    └── lib/
        ├── api.ts           # Typed API client + JWT storage/attachment
        ├── auth.tsx         # AuthProvider React context (login/register/logout)
        ├── useOverlayRun.ts # Synced overlay state hook (2s polling + BroadcastChannel)
        └── catalogSearch.ts # Draft Room search/pagination helpers
```

### Startup behavior

On every boot, `DbInitializer.InitializeAsync` runs inside a scoped service provider:

1. `Database.MigrateAsync()` applies any pending EF migrations.
2. If the `Users` table is empty, seeds the demo user `GodGamerDemo` (legacy, has no password so it cannot log in). Games are **not** seeded — the catalog fills exclusively via the RAWG sync (section 5a).

---

## 2. Database Schema

All primary keys are `uuid` (Guid, generated in application code). Enums are stored as strings for readability.

### Users

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| Username | varchar(50) | NOT NULL, **unique index** |
| PasswordHash | varchar(500) | NULL — legacy pre-auth accounts (e.g. `GodGamerDemo`) have no hash and can never log in |
| CreatedAt | timestamptz | NOT NULL |

### Games

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| Title | varchar(200) | NOT NULL |
| BaseDifficulty | int | NOT NULL, CHECK `1 ≤ BaseDifficulty ≤ 100` (`CK_Games_BaseDifficulty`) |
| ExternalId | varchar(50) | NULL (RAWG game id), **unique index** |
| Thumb | varchar(500) | NULL (cover image URL, RAWG media CDN) |
| NormalPrice | numeric(10,2) | NULL — RAWG tracks no pricing; null for all ingested and seeded games |
| SalePrice | numeric(10,2) | NULL — same |
| IsFeatured | boolean | NOT NULL, default `false` — curated competitive staple, pinned above the RAWG catalog (Phase 9) |
| PopularityRank | int | NOT NULL, default `999999` — RAWG most-added position; `0` for curated staples (Phase 9) |

Composite index `IX_Games_IsFeatured_PopularityRank` backs the default catalog ordering.


### Runs

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| UserId | uuid | FK → Users.Id, **cascade delete** |
| StartTime | timestamptz | NOT NULL |
| EndTime | timestamptz | NULL (set when run ends) |
| Status | varchar(20) | NOT NULL, enum string: `Active` \| `Failed` \| `Completed` |
| RunType | varchar(20) | NOT NULL, default `Standard` — enum string: `Standard` (10 games) \| `Lite` (5 games) (Phase 10) |
| TotalDifficultyScore | double precision | NOT NULL |
| TimerStatus | varchar(20) | NOT NULL, default `idle` — overlay speedrun timer: `idle` \| `running` \| `paused` \| `finished` (Phase 8) |
| TimerElapsedMs | bigint | NOT NULL, default 0 — accumulated ms as of TimerUpdatedAt; extrapolated while running |
| TimerUpdatedAt | timestamptz | NULL — when the timer last changed state |
| OverlayKey | varchar(64) | NULL — per-run secret letting the OBS overlay control the run without a login; revealed only to the owner |

### RunSlots

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| RunId | uuid | FK → Runs.Id, **cascade delete** |
| GameId | uuid | FK → Games.Id, **delete restricted** |
| Position | int | NOT NULL, CHECK `1 ≤ Position ≤ 10` (`CK_RunSlots_Position`) — the ceiling; a Lite run only fills 1–5 |
| Status | varchar(20) | NOT NULL, enum string: `Pending` \| `Won` \| `Lost` |
| SplitTimeMs | bigint | NULL — overlay timer reading locked in when the slot was split as beaten (Phase 8) |

**Unique index:** `(RunId, Position)` — a run can never have two slots at the same position.

### RunVotes (Phase 7)

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| RunId | uuid | FK → Runs.Id, cascade delete |
| UserId | uuid | FK → Users.Id, cascade delete |
| Value | int | NOT NULL, CHECK `Value IN (-1, 1)` (`CK_RunVotes_Value`) |
| CreatedAt | timestamptz | NOT NULL |

**Unique index:** `(RunId, UserId)` — one vote per user per run; changing direction updates the row, clearing (value 0) deletes it.

### RunComments (Phase 7)

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| RunId | uuid | FK → Runs.Id, cascade delete |
| UserId | uuid | FK → Users.Id, cascade delete |
| Body | varchar(1000) | NOT NULL — flat, no nesting in v1 |
| CreatedAt | timestamptz | NOT NULL |

**Index:** `(RunId, CreatedAt)` for chronological thread loads.

### RunReactions (Phase 7)

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| RunId | uuid | FK → Runs.Id, cascade delete |
| UserId | uuid | FK → Users.Id, cascade delete |
| Type | varchar(20) | NOT NULL — API accepts only `fire`, `skull`, `crown`, `gg` |
| CreatedAt | timestamptz | NOT NULL |

**Unique index:** `(RunId, UserId, Type)` — toggle semantics: a user has each reaction type at most once per run.

### Relationships

- `User 1 ── * Run` (cascade delete)
- `Run 1 ── * RunSlot` (max 10 enforced by API + position check constraint; cascade delete)
- `RunSlot * ── 1 Game` (restrict delete: games referenced by slots cannot be removed)
- `Run 1 ── * RunVote / RunComment / RunReaction` (cascade delete); each also FKs `User` (cascade delete)

### Migrations

| Migration | Status |
|---|---|
| `20260823204713_InitialCreate` | Generated; applied automatically at startup via `MigrateAsync()` |
| `20260824011412_AddCheapSharkGameFields` | Adds ExternalId/Thumb/NormalPrice/SalePrice to Games; auto-applied at startup |
| `20260824043027_MakeGamePricesNullable` | NormalPrice/SalePrice → nullable numeric(10,2) for the RAWG era (no storefront pricing) |
| `20260824232908_AddAuthAndCommunityFeed` | Adds `Users.PasswordHash`; creates RunVotes / RunComments / RunReactions with unique indexes and check constraint |
| `20260825014653_AddOverlayTimerState` | Adds `Runs.TimerStatus/TimerElapsedMs/TimerUpdatedAt/OverlayKey` and `RunSlots.SplitTimeMs` for the OBS overlay |
| `20260827030729_AddUserFollows` | Creates UserFollows (follower/followed, unique pair, not-self check) for the browse rail |
| `20260827234533_AddSpeedrunTrustSchema` | Creates Categories / Variables / VariableValues / Submissions / SubmissionVariables — the Records-layer trust schema (section 5d) |

---

## 3. REST API Specification

Base route pattern: `/api/{resource}`. All bodies are JSON. Validation errors return `400` with ASP.NET problem details. Endpoints marked 🔒 require an `Authorization: Bearer <JWT>` header (missing/invalid → `401`).

### Auth (Phase 7)

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{ "username": "3-50 chars", "password": "8-100 chars" }` | `201` → `{ token, user }` | `400` invalid body, `409` username taken |
| POST | `/api/auth/login` | `{ "username", "password" }` | `200` → `{ token, user }` | `401` bad credentials or password-less legacy account |
| GET 🔒 | `/api/auth/me` | — | `200` → User | `401` |

Tokens are HS256 JWTs valid for **30 days**. The SPA stores the token in `localStorage` (`ggg_token`) and attaches it on every request.

### Users

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/users` | — | `200` → `User[]` | — |
| GET | `/api/users/{id}` | — | `200` → User | `404` not found |

User object: `{ "id": "uuid", "username": "string", "createdAt": "ISO-8601 UTC" }`. The old password-less `POST /api/users` was **removed** in Phase 7 (it would let anyone squat usernames); account creation goes through `/api/auth/register`.

### Games

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/games` | — | `200` → `Game[]` (featured first, then RAWG popularity, then title — see §5b) | — |
| POST | `/api/games` | `{ "title": "string (≤200)", "baseDifficulty": 1-100 }` | `201` → Game | `400` invalid body |
| GET | `/api/games/{id}` | — | `200` → Game | `404` not found |

Game object: `{ "id": "uuid", "title": "string", "baseDifficulty": int, "thumb": "url | null", "normalPrice": decimal, "salePrice": decimal }`

### Runs

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST 🔒 | `/api/runs/initialize` | `{ "gameIds": ["uuid" × N, ordered by slot position], "runType": "Standard" \| "Lite" }` | `201` → Run object | `400` wrong count for the run type / bad run type / unknown game ids, `401` |
| GET | `/api/runs/{id}` | — | `200` → Run (ordered slots) | `404` not found |
| POST 🔒 | `/api/runs/{id}/report` | `{ "slotPosition": 1-N, "result": "Won" \| "Lost" }` | `200` → updated Run | `400` state-machine violation (below), `401`, `403` not the run owner, `404` unknown run |

`N` is 10 for a Standard run and 5 for a Lite one (`RunTypes.SlotCount`). `runType` is optional and defaults to `Standard`, so pre-Phase-10 clients keep working unchanged. Run objects carry both `runType` and `totalSlots`.

Since Phase 7 the run owner comes from the JWT claim — `userId` is no longer accepted in the initialize body, and only the owner can report results.

### Match-reporting state machine (`POST /api/runs/{id}/report`)

All rules enforced server-side; violations return `400` with a plain-text reason:

1. Run must be `Active` — reporting on a `Failed`/`Completed` run is rejected ("Run is not currently active.").
2. `slotPosition` must be 1–10 and exist on the run; `result` must parse to `Won` or `Lost`.
3. Target slot must be `Pending` (no double-reporting) **and** every preceding slot must be `Won` (strict sequential progression).
4. `result = Won` → slot becomes `Won`; if it was slot 10, the run becomes `Completed` with `EndTime = UtcNow`.
5. `result = Lost` → slot becomes `Lost`, run becomes `Failed` with `EndTime = UtcNow`; all remaining slots stay `Pending` and are permanently locked by rule 1.

### Leaderboard

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/leaderboard` | `?runType=Standard\|Lite` (optional, default `Standard`) | `200` → `LeaderboardEntry[]` (top 50) | `400` unknown run type |

Entry object: `{ "runId": "uuid", "streamerName": "string", "totalScore": double, "status": "Completed" | "Failed", "runType": "Standard" | "Lite", "slotsCompleted": int, "totalSlots": int, "endTime": "ISO-8601" | null }`

Query semantics (single SQL query via EF projection in `RunRepository.GetLeaderboardAsync`):

- Only finished runs (`Status != Active`) **of the requested run type** (Phase 10). Standard and Lite are ranked on separate boards — a 5-game run can never out-score a 10-game one, so mixing them would bury every Lite run.
- `totalScore` is the **earned** score — the slot formula summed over `Won` slots only (a failed run keeps the points from slots it survived; this differs from the run's stored `TotalDifficultyScore`, which is the projected total for all 10 slots).
- Ordering: earned score desc → `Completed` before `Failed` on ties → most recent `EndTime` first. Top 50 returned.

### Community Feed (Phase 7 — `FeedController`)

Every **finished** run (Completed or Failed) is a feed post — there is no separate Post table.

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/feed?sort=hot\|new\|top&page=N` | — | `200` → `{ posts: FeedPost[], page, hasMore }` | — |
| PUT 🔒 | `/api/runs/{id}/vote` | `{ "value": 1 \| -1 \| 0 }` (0 clears) | `200` → `{ voteScore, myVote }` | `400` bad value, `401`, `404` unknown/unfinished run |
| POST 🔒 | `/api/runs/{id}/reactions/toggle` | `{ "type": "fire" \| "skull" \| "crown" \| "gg" }` | `200` → `{ reactions, myReactions }` | `400` bad type, `401`, `404` |
| GET | `/api/runs/{id}/comments` | — | `200` → `Comment[]` (chronological) | — |
| POST 🔒 | `/api/runs/{id}/comments` | `{ "body": "1-1000 chars" }` | `201` → Comment | `400`, `401`, `404` |

FeedPost object: `{ runId, userId, streamerName, status, runType, endTime, totalScore (earned, leaderboard formula), slotsCompleted, totalSlots, slotStatuses, slotTitles, slotThumbs, elapsedMs (frozen overlay clock; 0 if the timer was never used), slotSplitTimes (cumulative ms per slot, null if unbeaten), voteScore, myVote, commentCount, reactions: { type: count }, myReactions: [types] }`. `myVote`/`myReactions` are populated when a JWT is sent (the endpoint itself is public). The feed card renders `elapsedMs` next to the score and a Splits list matching the control deck whenever any `slotSplitTimes` are present.

Sorting — 20 posts per page:

- `new`: latest `EndTime` first (SQL-side paging).
- `top`: highest vote sum first (SQL-side paging), ties broken by `EndTime`.
- `hot` (default): the **200 most recent** finished runs are ranked in memory by `voteScore / (hoursSinceEnd + 2)^1.5` — the classic gravity-decay curve — then paged. Older runs age out of Hot naturally.

### OBS Overlay & Control Deck (Phase 8 — `OverlayController`)

Synchronized run state shared by the OBS overlay and the streamer control deck. **Reads are public**; actions require either the **owner's JWT** (control deck) or the run's **overlay key** passed as `?key=` (the OBS browser source, which can't log in — the key is minted at run initialization, compared in constant time, and revealed only to the owner). Every action returns the fresh `OverlayState` so clients update instantly.

| Method | Route | Auth | Success | Errors |
|---|---|---|---|---|
| GET | `/api/runs/{id}/overlay` | none (owner JWT additionally reveals `overlayKey`, lazily minting one for pre-Phase-8 runs) | `200` → OverlayState | `404` |
| POST | `/api/runs/{id}/overlay/toggle` | owner JWT **or** `?key=` | `200` → OverlayState | `403` no valid auth, `404` |
| POST | `/api/runs/{id}/overlay/split` | owner JWT **or** `?key=` | `200` → OverlayState | `400` run not Active / all beaten, `403`, `404` |
| POST | `/api/runs/{id}/overlay/undo` | owner JWT **or** `?key=` | `200` → OverlayState | `400` nothing to undo, `403`, `404` |
| POST | `/api/runs/{id}/overlay/reset` | owner JWT **or** `?key=` | `200` → OverlayState | `403`, `404` |

OverlayState object: `{ runId, streamerName, runStatus, runType: "Standard"|"Lite", currentSlotIndex (0-based index of the first non-Won slot), timerStatus: "idle"|"running"|"paused"|"finished", elapsedMs (computed server-side at response time), games: [{ gameId, slotNumber, title, thumb, baseDifficulty, completed, splitTimeMs }] × N, overlayKey (owner only, else null) }`

Timer semantics (server is the source of truth; clients extrapolate locally while running):

- **toggle** — idle/paused → `running` (stamps `TimerUpdatedAt`); running → `paused` (folds the running span into `TimerElapsedMs`); `finished` is a no-op (reset is the way back).
- **split** — marks the first non-Won slot `Won` and locks `SplitTimeMs` to the current elapsed reading; the split on the **last** slot (10th Standard, 5th Lite) sets the run `Completed`, stamps `EndTime`, and freezes the timer as `finished`. Rejected unless the run is `Active`.
- **undo** — reverts the last non-Pending slot to `Pending` (clearing its split). Reopens a `Completed`/`Failed` run back to `Active` (clearing `EndTime`; a `finished` timer becomes `paused`) — so it can also rescue a mis-reported loss from the tracker.
- **reset** — all slots `Pending`, splits cleared, run `Active`, timer `idle` at 0 ms. A reset run leaves the feed/leaderboard until it finishes again.

Note: overlay splits bypass the tracker's report state machine by design (they only ever mark slots `Won` in order); the `/run/[id]` tracker remains the place to record a Loss.

### Admin

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/admin/hard-reset` | — | `200` → `{ message, runsDeleted, slotsDeleted, gamesDeleted }` | — |

Hard reset wipes RunSlots → Runs → Games (in that order — RunSlots reference Games with restrict-delete) using EF Core 8 `ExecuteDeleteAsync()` bulk deletes (run votes/comments/reactions cascade away with the runs), re-seeds only the demo user, then **fires the RAWG sync in the background** (own DI scope, detached from the request's cancellation token) and returns immediately — the catalog stays empty until the sync lands. The response no longer includes sync counts — a full 500-page ingestion takes ~13 minutes, far beyond any sane HTTP timeout, so the previous inline-await design (Phase 5.2) was retired with the RAWG switch. Watch the API logs for sync progress (logged every 25 pages). **Users are preserved.** ⚠️ Currently unauthenticated — lock down before exposing publicly.

### DTO validation note (fixed production 500)

Request DTOs are positional records; validation attributes must target the **constructor parameter** (`[Required]`), never the property (`[property: Required]`). The property form compiles but makes ASP.NET Core model validation throw `InvalidOperationException` → empty `500` on every POST (the browser showed it as `Failed to fetch` because error responses carry no CORS headers).

Run object:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "startTime": "ISO-8601 UTC",
  "endTime": null,
  "status": "Active",
  "totalDifficultyScore": 2661.5,
  "slots": [
    { "id": "uuid", "gameId": "uuid", "position": 1, "status": "Pending" }
  ]
}
```

---

## 4. Mathematical Logic

### Slot difficulty formula

Each of the 10 slots contributes a position-scaled score:

```
SlotScore = BaseDifficulty × (1 + 0.1 × (Position − 1)²)
TotalDifficultyScore = Σ SlotScore for positions 1..10
```

Implemented in `RunController.Initialize` (C#): `game.BaseDifficulty * (1 + 0.1 * Math.Pow(position - 1, 2))`.

### Multiplier scaling by position

| Position | Multiplier | Position | Multiplier |
|---|---|---|---|
| 1 | 1.0× | 6 | 3.5× |
| 2 | 1.1× | 7 | 4.6× |
| 3 | 1.4× | 8 | 5.9× |
| 4 | 1.9× | 9 | 7.4× |
| 5 | 2.6× | 10 | 9.1× |

The quadratic curve makes late slots dominate: a difficulty-90 game in slot 10 is worth 819 points versus 90 in slot 1. Total multiplier across all 10 slots: 38.5× — a full gauntlet of difficulty-100 games scores 3,850.

---

## 5. Seeded Data

Seeded on first boot against an empty database (idempotent — skipped if any rows exist):

**Users (1):** `GodGamerDemo` — legacy account with no password; it exists for historical data but cannot log in since Phase 7.

**Games: none.** The 15-game hand-curated baseline was removed in Phase 6.1 — the catalog is populated exclusively by the RAWG sync (section 5a) and stays empty until it finishes.

---

## 5a. RAWG Catalog Ingestion (Phase 6 — replaces CheapShark entirely)

Phase 6 abandoned the CheapShark/Steam-deals architecture (capped at ~3,060 games, Steam-only) for the **RAWG Video Games Database API**: up to **20,000 games across all platforms** per sync. RAWG provides rich metadata (name, cover art, Metacritic) but **no storefront pricing** — hence the nullable price columns. `CheapSharkClient.cs`/`CheapSharkDeal.cs` are deleted.

The browser never calls RAWG. All ingestion happens server-side:

```
RAWG API (api.rawg.io/api/games, ordering=-added)
        │  HTTPS, typed client + resilience handler (Polly retries/backoff)
        ▼
IGameSyncService / GameSyncService (scoped — the actual ingestion)
        ▲                          ▲
        │ DI scope per cycle       │ fire-and-forget (own DI scope)
GameSyncBackgroundService     AdminController hard-reset
(startup + every 24 hours)    (background sync trigger)
        │
        ▼
IGameRepository.UpsertGamesAsync → PostgreSQL Games table
```

### API key (required)

RAWG requires a free API key ([rawg.io/apidocs](https://rawg.io/apidocs)). The client reads it from configuration key **`RawgApiKey`** — set it in `appsettings.json` locally or as the `RawgApiKey` environment variable on Railway. **Without a key the sync skips entirely with a logged warning** (the app still boots and serves the seeded catalog); no requests are wasted against a guaranteed 401.

### Components

- **`Services/RawgClient.cs`** — typed `HttpClient` wrapper. Base address `https://api.rawg.io/`, 30s timeout, `AddStandardResilienceHandler()`. `GetTopGamesAsync(int pageNumber)` queries `api/games?key={key}&page={n}&page_size=40&ordering=-added` (most-added games first — RAWG's strongest popularity signal). A 404 (`Invalid page.` past the last page) or 400 returns an empty list so the loop stops gracefully.
- **`Services/RawgGame.cs`** — JSON models: `RawgGame` (`id`, `name`, `background_image`, `metacritic`) and the paged `RawgGamesResponse` envelope (`results`).
- **`Services/IGameSyncService.cs` / `GameSyncService.cs`** — scoped service holding the ingestion: a loop over pages **1 to 500** (500 × 40 = 20,000 games) with a **strict 1500 ms delay between page requests**, deduplication by RAWG `id` (stored as `ExternalId`), mapping to `Game`, single upsert at the end. Returns `GameSyncResult(GamesProcessed, GamesAdded)`. Progress logged every 25 pages. **A full sync takes ~13 minutes** (500 × 1.5 s).
- **`Services/GameSyncBackgroundService.cs`** — hosted service that only schedules: resolves `IGameSyncService` in a fresh DI scope **on startup and every 24 hours**. The long interval keeps usage well inside RAWG's **20,000 requests/month free-tier limit** (≈500/day scheduled + occasional hard-resets ≈ 15–16k/month). Failures are logged and retried next cycle — the host never crashes over a failed sync.

### Field mapping

| RAWG JSON | Game entity | Notes |
|---|---|---|
| `id` (number) | `ExternalId` (string) | dedupe + upsert match key |
| `name` | `Title` | truncated to 200 chars |
| `background_image` | `Thumb` | RAWG media CDN (`media.rawg.io`) |
| `metacritic` | `BaseDifficulty` | clamped 1–100; **fallback 70 when null/0** |
| — | `NormalPrice` / `SalePrice` | always `null` — RAWG has no pricing |
| *(ingest position)* | `PopularityRank` | running 1-based index across all pages; `0` reserved for curated staples (Phase 9) |

### Upsert semantics (`GameRepository.UpsertGamesAsync`)

- Match existing rows by `ExternalId` first, then case-insensitive title.
- Matched rows: refresh `Thumb` and prices, backfill `ExternalId` — but **never overwrite the curated `BaseDifficulty`** of seeded games.
- **`IsFeatured` is a one-way promotion**: the sync may set it, never clear it. A featured row also keeps `PopularityRank = 0` instead of taking its RAWG position.
- Unmatched rows are inserted; returns the count of newly added games.

EF Core SQL command logging (`Microsoft.EntityFrameworkCore.Database.Command`) and HttpClient chatter remain at `Warning` in `appsettings.json` — at Information level each sync would print ~20,000 INSERT statements into the logs.

---

## 5b. Hybrid Catalog Sorting (Phase 9 — `IsFeatured` + `PopularityRank`)

A 20,000-game catalog sorted alphabetically buries the games people actually run gauntlets on. The catalog therefore has **two sort keys** rather than a hand-maintained ordering:

| Key | Owner | Meaning |
|---|---|---|
| `IsFeatured` | `DbInitializer` seed | Curated competitive staple. Overrides popularity entirely. |
| `PopularityRank` | RAWG sync | Position in RAWG's `-added` ordering. Lower is more popular. |

**Default order** (`GameRepository.GetAllAsync`, serving `GET /api/games`):

```csharp
.OrderByDescending(g => g.IsFeatured)
.ThenBy(g => g.PopularityRank)
.ThenBy(g => g.Title)
```

`Title` is only a tiebreaker, so the result is: curated staples (alphabetical among themselves, all at rank 0), then the RAWG catalog in most-added order, then any pre-Phase-9 rows left at the `999999` default.

### Running EF Core commands locally

`Data/DesignTimeDbContextFactory.cs` lets `dotnet ef` build an `AppDbContext` without a reachable database. EF still probes the entry point first, and `Program.cs` migrates/seeds at startup, so that probe hangs for the full 5-minute host-resolver timeout before falling back to the factory. Cap it:

```bash
DOTNET_HOST_FACTORY_RESOLVER_DEFAULT_TIMEOUT_IN_SECONDS=1 dotnet ef migrations add <Name>
```

That turns a ~5-minute stall into ~5 seconds.

### Curated seed (`DbInitializer.SeedFeaturedGames`)

Twelve competitive staples — Counter-Strike 2, League of Legends, Dota 2, VALORANT, Tekken 7, Super Smash Bros. Melee, Street Fighter 6, Rocket League, Overwatch 2, Apex Legends, Fortnite, StarCraft II — seeded with `IsFeatured = true`, `PopularityRank = 0`, and hand-set difficulties. Runs on every boot and after an admin hard-reset.

Seeding is **idempotent by title**: if RAWG already ingested a title, the seeder *promotes that existing row* instead of inserting a duplicate. Titles deliberately match RAWG's spelling so the case-insensitive title match in `UpsertGamesAsync` merges the two — a curated row starts with `ExternalId = null` and `Thumb = null`, and the sync backfills both.

### Interaction with the sync guard

`GameSyncService` skips ingestion when the catalog is already populated (serverless cold-starts would otherwise re-run 500 RAWG requests on every wake). Because the seeder now writes games at startup, that guard can no longer be "any game exists" — it would permanently suppress the sync. `IGameRepository.HasIngestedCatalogAsync` therefore asks a narrower question:

```csharp
context.Games.AnyAsync(g => !g.IsFeatured, cancellationToken);
```

Seeded staples don't count as an ingested catalog; only RAWG rows do. (This replaced the old `AnyAsync`, whose only caller was this guard.)

### Frontend consumption

`GET /api/games` returns `isFeatured` and `popularityRank` on every game, but the Draft Room sorts client-side over the full in-memory catalog, so the server order alone would be invisible. `catalogSearch.ts` gained a **`featured`** `CatalogSort` mode that mirrors the server comparator (`isFeatured` desc → `popularityRank` asc → title), and the Draft Room now defaults to it. Typing a search switches to `relevance`, whose score ties now break on featured/popularity instead of alphabetically; clearing the box returns to `featured`.

---

## 5c. Gauntlet Lite (Phase 10 — `RunType`)

A ten-game gauntlet is a multi-hour commitment. **Gauntlet Lite** is a five-game variant, tracked as a property of the run rather than a separate entity, so every existing code path (scoring, splits, feed, overlay) keeps working untouched.

### The run type

`Models/RunType.cs` defines the enum plus `RunTypes`, the **single source of truth for slot counts**:

| Run type | Slots | Enum value |
|---|---|---|
| `Standard` | 10 | 0 |
| `Lite` | 5 | 1 |

`runType.SlotCount()` is the only place those numbers live on the backend; everything that validates a draft, decides a run is finished, or reports `totalSlots` calls it. `RunTypes.TryParse` handles client input — it defaults blank/absent values to `Standard` and, unlike a bare `Enum.TryParse`, rejects undefined values (`"99"` would otherwise parse into an out-of-range `RunType` and get persisted).

Stored as a string like `RunStatus`, with `HasDefaultValue(RunType.Standard)` — so the `AddRunTypeToRuns` migration backfills every pre-existing run as `Standard` rather than leaving nulls. Indexed (`IX_Runs_RunType`) because the leaderboard filters on it.

### What changed vs. what was already dynamic

Most of the codebase never hardcoded 10 — slot loops, the score formula, the feed, and `OverlayController` all derive from the run's actual slots. The genuine 10-assumptions were:

- `RunController.RequiredSlotCount = 10` — the initialize count check and the completion check. Both now use `run.RunType.SlotCount()`.
- `InitializeRunRequest.GameIds` — `[MinLength(10), MaxLength(10)]` relaxed to the widest legal range (5–10); the *exact* count is validated against the run type in the controller, which is the only place that knows it.
- Frontend `SLOT_COUNT = 10` in the Draft Room, `slotsCompleted/10` on the leaderboard, `of 10` in the feed.

This also fixed a latent inconsistency: `OverlayController.Split` completed a run at its **max slot position**, while `RunController.Report` completed only at position **10**. A run with anything other than 10 slots could be finished via the overlay but never via `/report`. Both now agree.

`CK_RunSlots_Position` (`1 ≤ Position ≤ 10`) is unchanged — a Lite run's five positions are a subset, so the constraint still holds without a risky migration.

### Separate leaderboards

`GET /api/leaderboard?runType=` filters on the run type and defaults to `Standard`. The boards are separate rather than merged because the score formula is `base × (1 + 0.1 × (position−1)²)`: slots 6–10 carry multipliers of 3.5× through 9.1×, so a perfect Lite run scores a fraction of a mediocre Standard one and would never surface on a shared board.

### Frontend

- `RUN_TYPE_SLOTS` / `slotsForRunType` in `lib/api.ts` mirror `RunTypes` for the client.
- `components/RunTypeBadge.tsx` renders the **LITE MODE** pill and deliberately renders *nothing* for Standard — the full gauntlet is the default and doesn't need a label. Used on the Draft Room, run tracker, control deck, and feed posts.
- **Draft Room** — Standard/Lite toggle; switching resizes the board and re-packs picks in order.
- **Overlay** — the `x/N` counter and wheel slot numbers come from `games.length` (falling back to `slotsForRunType`), plus a compact `LITE` pill in the timer plate. Styled inline rather than with `RunTypeBadge` to match the overlay's OBS-tuned rendering rules (section 7).
- **Leaderboard** — "Standard (10 Games)" / "Lite (5 Games)" tabs; the fetch effect keys on the selected type.

---

## 5d. Speedrun Records — Trust Schema (Records Phase 1)

A verified speedrun ledger running **parallel to** the gauntlet system and the automated RAWG catalog. The gauntlet stays self-reported and social; the Records layer is a court: nothing reaches a leaderboard until a moderator examines VOD proof. The two trust models never mix — a `Submission` is not a `Run`.

### Design split: rules engine vs. ledger

| Layer | Entities | Delete behavior | Rationale |
|---|---|---|---|
| **Rules engine** | `Category` → `Variable` → `VariableValue` | Cascade down the tree | Moderators own and reshape it freely |
| **Ledger** | `Submission`, `SubmissionVariable` | Restrict on every FK out | Verified history must never vanish because a game, category, player, or value was deleted |

The two interact safely: a `Category` with submissions cannot be deleted (Submission → Category is Restrict), and a `VariableValue` referenced by any submission cannot be cascaded away (SubmissionVariable → VariableValue is Restrict — the DB refuses the parent delete).

### Categories

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| GameId | uuid | FK → Games.Id, **restrict** |
| Name | varchar(100) | NOT NULL — "Any%", "100%", "Glitchless" |
| Rules | text | NULL — markdown contract examiners verify against |
| CreatedAt | timestamptz | NOT NULL |

**Unique index:** `(GameId, Name)` — one "Any%" per game.

### Variables

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| CategoryId | uuid | FK → Categories.Id, **cascade** |
| Name | varchar(100) | NOT NULL — "Platform", "Glitch Restriction" |
| IsSubcategory | boolean | NOT NULL — `true` splits the leaderboard into distinct boards per value; `false` is a filter on one board |
| IsRequired | boolean | NOT NULL — submission must select a value |

**Unique index:** `(CategoryId, Name)`.

### VariableValues

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| VariableId | uuid | FK → Variables.Id, **cascade** |
| Value | varchar(100) | NOT NULL — "Nintendo 64", "Glitchless" |

**Unique index:** `(VariableId, Value)`.

### Submissions

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| GameId | uuid | FK → Games.Id, **restrict** |
| CategoryId | uuid | FK → Categories.Id, **restrict** |
| PlayerId | uuid | FK → Users.Id, **restrict** |
| PrimaryTimeMs | bigint | NOT NULL, CHECK `> 0` (`CK_Submissions_PrimaryTimeMs`) — the strict leaderboard sort metric |
| VideoUrl | varchar(500) | NOT NULL — Twitch/YouTube proof; no video, no verification |
| PlayedOn | timestamptz | NOT NULL (DateTimeOffset) — date claimed by the runner |
| IsEmulator | boolean | NOT NULL |
| Status | varchar(20) | NOT NULL, default `Pending` — enum string: `Pending` \| `Verified` \| `Rejected` |
| ExaminerId | uuid | NULL, FK → Users.Id, **restrict** — the moderator who decided |
| RejectReason | varchar(1000) | NULL — required by the API when rejecting (enforced in Phase 2 controllers) |
| SubmittedAt | timestamptz | NOT NULL |
| ReviewedAt | timestamptz | NULL while Pending |

**Indexes:**

- `(CategoryId, Status, PrimaryTimeMs)` — the leaderboard query: verified rows in a category, fastest first.
- `(PlayerId, CategoryId)` — player PBs and profile history.
- `(GameId, Status, SubmittedAt)` — the mod verification queue, oldest first.

### SubmissionVariables (join)

| Column | Type | Constraints |
|---|---|---|
| SubmissionId | uuid | **composite PK**, FK → Submissions.Id, cascade |
| VariableValueId | uuid | **composite PK**, FK → VariableValues.Id, **restrict** |

Links a submission to each selected value (e.g. Platform = N64). Deleting a submission drops its selections; the values themselves are protected while referenced.

### Deliberately deferred (Phase 2+)

Individual levels, timing-method variants (RTA vs. loadless vs. IGT as separate columns), obsolete-run flagging, per-game moderator roles, and the submission/verification API surface. `PrimaryTimeMs` is the single canonical metric until a category needs more.

---

## 6. CORS Policy

Policy name: `AllowFrontend` (applied via `app.UseCors` before authorization/controllers).

- Allowed origins:
  - `http://localhost:3000` (local Next.js)
  - `https://godgamergauntlet.com`
  - `https://www.godgamergauntlet.com`
  - any `https://*.vercel.app` subdomain (preview deployments; wildcard subdomains enabled)
- Headers: `AllowAnyHeader`. Methods: `AllowAnyMethod`. Credentials: allowed.

### Middleware pipeline order (proxy-aware)

The order in `Program.cs` matters behind Railway's TLS-terminating proxy:

1. `UseForwardedHeaders` (`X-Forwarded-For` / `X-Forwarded-Proto`, with `KnownNetworks`/`KnownProxies` cleared because Railway's proxy is not on loopback) — restores the original request scheme.
2. `UseCors("AllowFrontend")` — answers `OPTIONS` preflights first.
3. `UseHttpsRedirection` — after CORS, so preflights are never 307-redirected (browsers reject redirects on preflight, which surfaced as `Failed to fetch` on `POST /api/runs/initialize`).
4. `UseAuthentication` → `UseAuthorization` → `MapControllers`.

---

## 7. Frontend Architecture (GodGamerGauntlet.Web)

### Design system — "High-Stakes Dark Mode"

Tailwind CSS v4 is configured CSS-first: design tokens are declared in `@theme` inside `src/app/globals.css` (v4 replaced `tailwind.config.ts` with CSS token declarations).

| Token | Value | Utility classes |
|---|---|---|
| `--color-dark` | `#0A0E1A` | `bg-dark` (global body background) |
| `--color-surface` | `#0F111A` | `bg-surface` |
| `--color-accent-streak` | `#FFC000` | `text-accent-streak`, `bg-accent-streak` — scores, primary CTA |
| `--color-accent-win` | `#00E5FF` | `text-accent-win` — success, positive stats |
| `--color-accent-death` | `#FF3366` | `text-accent-death` — errors, destructive actions |
| `panel` (custom `@utility`) | `rgba(255,255,255,0.04)` bg + `border-white/10` | frosted card surface |
| `--font-heading` | Space Grotesk | `font-heading` |
| `--font-mono` | JetBrains Mono | `font-mono` — timers, scores, run IDs |
| `--font-sans` | Inter | default body font |

### API client (`src/lib/api.ts`)

Typed wrappers over `fetch` against `NEXT_PUBLIC_API_URL`. The JWT lives in `localStorage` under `ggg_token` (`getToken`/`setToken`) and is attached as `Authorization: Bearer` on every request automatically. Function groups: auth (`register`, `login`, `getMe`), catalog/runs (`getGames`, `getUsers`, `initializeRun(gameIds)`, `getRun`, `reportSlotMatch`, `getLeaderboard`), feed (`getFeed(sort, page)`, `voteOnRun`, `toggleReaction`, `getComments`, `addComment`), overlay (`getOverlayState(runId, key?)`, `sendOverlayAction(runId, action, key?)`). Non-2xx responses throw with the response body as the message.

### Overlay state sync (`src/lib/useOverlayRun.ts`)

Shared hook behind `/overlay/[runId]` and `/control/[runId]`. The server is the source of truth: every open view polls `GET .../overlay` every **2 s**, and successful actions broadcast the fresh state over a `BroadcastChannel` (`ggg-overlay-{runId}`) so same-browser tabs update instantly (the overlay key is stripped from broadcasts). `SpeedrunTimer` extrapolates the running clock locally between polls (33 ms tick, derived-in-render for React purity rules), so the display never depends on network latency.

### Auth state (`src/lib/auth.tsx` + `src/components/SiteNav.tsx`)

`AuthProvider` (client context, mounted in `layout.tsx`) validates the stored token against `/api/auth/me` on load and exposes `{ user, loading, login, register, logout }`. `SiteNav` is a sticky header on every page: logo, Feed / Draft Room / Leaderboard links, and either the username + Log out or a Sign in button. `/login` hosts both sign-in and create-account forms (mode toggle).

### Routes

| Route | Purpose |
|---|---|
| `/` | **Community feed** (Phase 7) — Hot/New/Top tabs; every finished run is a post card with vote arrows (optimistic updates), COMPLETED/FAILED badge, earned score, a 10-square slot strip (cyan won / red lost / dim pending), reaction bar (🔥 💀 👑 🫡), and an expandable inline comment thread with composer. Anonymous visitors can read everything; voting/reacting/commenting prompt sign-in. A compact "Enter the Draft Room" banner sits on top |
| `/login` | Sign in / create account (JWT stored on success) |
| `/draft` | The Draft Room (below) — requires sign-in to launch |
| `/run/[id]` | Live Run Tracker — header with streamer, status badge (cyan Active / red Failed / gold Completed) and total score; 10-slot board where won slots show earned score in cyan, the current slot glows with RECORD WIN / RECORD LOSS buttons (**shown only to the run owner** since Phase 7; spectators see a "Spectating" note), future slots are dimmed, and a lost slot shows the death state and locks the board; "Start a New Run" + "View Leaderboard" links when the run is over |
| `/leaderboard` | Global Leaderboard — top-50 finished runs with rank (gold #FFD700 / silver #C0C0C0 / bronze #CD7F32 for the podium), streamer, earned score, slots survived (`n/10`), Completed/Failed badge, and finish time; "Draft a New Run" CTA. Linked from the home page, the Draft Room header, and the run tracker end state |
| `/overlay/[runId]` | **OBS browser-source overlay** (Phase 8) — fully transparent background (`html.obs-overlay` CSS class), no scrollbars, ~420px wide. 3D cylindrical wheel of the 10 drafted games (`perspective: 1000px`, per-item `rotateX(offset × -32°) translateZ(168px)`, 0.45s `cubic-bezier(0.2,0.8,0.2,1)` rotation): active slot is a dark pill with cyan neon glow, cover, title, and `X/10` counter; adjacent slots angle back with reduced opacity; beaten slots show a green check + strikethrough. Neon-green `H:MM:SS.cc` timer below (amber pulse when paused, gold when finished). Hotkeys: **Space** play/pause, **Enter/NumpadEnter** split, **R×2** reset (armed for 1.5s with on-screen warning), **P** toggles hidden helper buttons. Actions authenticate via the `?key=` overlay key in the URL |
| `/control/[runId]` | **Streamer control deck** (Phase 8) — mobile/OBS-dock-friendly: live mirrored timer + status, big tactile buttons (green ▶ Play / amber ❚❚ Pause, cyan "Game Beaten — Next", Undo Previous, two-step red Reset Gauntlet), now-playing card, up-next list, per-game split times, and one-click "Copy OBS Browser Source URL" (embeds the overlay key). Controls disabled for non-owners; state syncs via the shared `useOverlayRun` hook |

### The Draft Room (`/draft`)

Client component with this flow:

1. **Identity** — the run belongs to the logged-in user (shown as "Drafting as _username_"); signed-out visitors get a sign-in banner and a disabled launch button. The Phase 2 user dropdown is gone.
2. **Game catalog** — searchable, paginated grid of the live database catalog (RAWG-ingested + seeded games): rounded cover thumbnail (letter placeholder when absent), title with match highlighting, base difficulty, and price. **Price tags are hidden entirely when prices are `null`** (all RAWG-sourced games) so cards stay visually balanced; when present, the sale price shows in cyan with the normal price struck through. Instant client-side search ranks prefix/word/substring/fuzzy matches; operators `sale`, `free`, `>80`, `<$10` filter price and difficulty (price operators exclude games without pricing data; price sorts push them last). 24 games per page with compact pager. `/` or Ctrl/Cmd+K focuses the search box. "Add to Draft" fills the first empty slot; a game can be drafted only once.
3. **Gauntlet mode** (Phase 10) — a Standard / Lite toggle above the board. Switching resizes the board and re-packs the picks in order, so shrinking to Lite keeps the first five and drops the rest; the board is never left over capacity.
4. **Gauntlet board** — `slotCount` numbered slots (10 Standard, 5 Lite) showing per-slot math (`base × multiplier = slot score`), with move up/down and remove controls.
5. **Live score header** — sticky scoreboard recalculating `Total Projected Score` client-side with the same formula the API uses (section 4), plus an `x/N` slot counter and a LITE MODE badge.
6. **Launch Gauntlet** — enabled only at `N/N` slots; POSTs to `/api/runs/initialize` with the chosen `runType`, then shows the returned Run ID, server-calculated score, and a link to `/run/{id}`.

### Environment

`GodGamerGauntlet.Web/.env.local` (gitignored — create per environment):

```
NEXT_PUBLIC_API_URL=http://localhost:5000
```

The API's dev profile (`launchSettings.json`) was aligned to port **5000** to match. On Vercel, set `NEXT_PUBLIC_API_URL` to the Railway API domain.

---

## 8. Deployment Instructions

### Local development

Prerequisites: .NET 8 SDK, PostgreSQL 14+ running locally, `dotnet-ef` global tool (`dotnet tool install --global dotnet-ef --version "8.0.*"`).

```bash
# 1. Configure the connection string (or keep the default in appsettings.json):
#    Host=localhost;Port=5432;Database=godgamergauntlet;Username=postgres;Password=postgres

# 2. Run — migrations apply and seed data loads automatically at startup:
dotnet run --project GodGamerGauntlet.Api

# Swagger UI: https://localhost:<port>/swagger
```

Manual migration commands (normally unnecessary — startup auto-migrates):

```bash
dotnet ef migrations add <Name> --project GodGamerGauntlet.Api
dotnet ef database update --project GodGamerGauntlet.Api
```

### Railway (cloud)

1. Create a Railway project; add the **PostgreSQL** plugin and a service pointing at this GitHub repo (`Deer-Leeon/GodGamerGauntlet`).
2. Set the service root/build to the `GodGamerGauntlet.Api` project (Nixpacks detects .NET; or supply a Dockerfile later).
3. Environment variables on the API service:
   - `ConnectionStrings__DefaultConnection` = `Host=<PGHOST>;Port=<PGPORT>;Database=<PGDATABASE>;Username=<PGUSER>;Password=<PGPASSWORD>;SSL Mode=Require;Trust Server Certificate=true` (compose from Railway's Postgres variables)
   - `ASPNETCORE_URLS` = `http://0.0.0.0:$PORT` (bind to Railway's assigned port)
   - `ASPNETCORE_ENVIRONMENT` = `Production`
   - `RawgApiKey` = your RAWG API key (free at [rawg.io/apidocs](https://rawg.io/apidocs)) — **the catalog sync silently skips without it**
   - `Jwt__Secret` = a long random string (e.g. `openssl rand -base64 48`) — **without it the API generates a random per-boot signing key and every deploy/restart logs all users out** (especially disruptive with Serverless sleep/wake cycles)
4. Deploy. Startup auto-migration brings the schema up to date and seeds the catalog on the first boot.
5. Point the Vercel frontend at the Railway public domain; CORS already allows `*.vercel.app`.

### Vercel (frontend)

1. Import the GitHub repo in Vercel and set the project **Root Directory** to `GodGamerGauntlet.Web`.
2. Set the environment variable `NEXT_PUBLIC_API_URL` to the Railway API's public URL.
3. Deploy — the production domain (`*.vercel.app`) is already permitted by the API's CORS policy.

### Local frontend development

```bash
# Terminal 1 — API on http://localhost:5000
dotnet run --project GodGamerGauntlet.Api

# Terminal 2 — Next.js on http://localhost:3000
cd GodGamerGauntlet.Web && npm run dev
```

---

## 9. Phase History

| Phase | Scope |
|---|---|
| 1 | Project scaffold, EF Core + Npgsql, domain models, AppDbContext, Game/Run repositories, GameController, RunController with difficulty formula, InitialCreate migration |
| 1.5 | User management layer (repository + controller), DbInitializer (auto-migrate + seed 15 games + demo user), CORS `AllowFrontend`, this ledger |
| 2 | Next.js 16 frontend (`GodGamerGauntlet.Web`): Tailwind v4 design tokens, font stack, typed API client, landing page, The Draft Room with live scoring and run initialization |
| 2.1 | CORS `AllowFrontend` extended with `https://godgamergauntlet.com` and `https://www.godgamergauntlet.com` so the production custom domain can call the API |
| 2.2 | Forwarded-headers middleware (Railway proxy) and pipeline reorder: CORS before HTTPS redirection so `OPTIONS` preflights on `POST` succeed — fixes `Failed to fetch` on Launch Gauntlet |
| 3 | Fixed record-DTO validation attributes that 500'd every POST body; `POST /api/runs/{id}/report` with strict sequential state machine; `getRun`/`reportSlotMatch` client functions; Live Run Tracker at `/run/[id]` |
| 4 | Global Leaderboard: `GET /api/leaderboard` (top 50 finished runs, earned-score aggregation in SQL, Completed-over-Failed tiebreak), `getLeaderboard` client function, `/leaderboard` page with podium styling, nav links from home/draft/run pages |
| 5 | CheapShark catalog ingestion: Game entity extended with ExternalId/Thumb/NormalPrice/SalePrice (+migration), `UpsertGamesAsync`, typed `CheapSharkClient` with resilience handler and required User-Agent, `GameSyncBackgroundService` (startup + 12h cycle, 1.5s page delay), Draft Room catalog with thumbnails and prices |
| 5.1 | `POST /api/admin/hard-reset` (`ExecuteDeleteAsync` wipe of slots/runs/games + baseline re-seed via extracted `DbInitializer.SeedAsync`); ingestion refined to two targeted queries (AAA hits by review volume, Metacritic 80+ with 1000+ reviews) deduplicated by gameID — dropped `desc=1` which inverted the Reviews sort |
| 5.2 | Ingestion extracted into scoped `IGameSyncService`/`GameSyncService` (returns processed/added counts); background worker now only schedules it and the interval dropped 12 h → 4 h; hard-reset awaits the sync inline so the full catalog is live when the request returns |
| 5.3 | Massive single-pass ingestion: dual-pass replaced by a 100-page `sortBy=Reviews` loop (1.5 s per page); CheapShark caps at page 50 (~3,060 deals) with `400 Too Many Results`, handled as graceful end-of-catalog; hard-reset now takes ~1.5–2.5 min; EF SQL logging quieted to Warning |
| 5.4 | Draft Room catalog search + pagination: ranked instant search (`src/lib/catalogSearch.ts`) with operators `sale`/`free`/`>80`/`<$10`, match highlighting, 24-per-page pager, `/` and Ctrl/Cmd+K focus |
| 6 | **RAWG replaces CheapShark**: `CheapSharkClient`/`CheapSharkDeal` deleted; `RawgClient` (`api/games?ordering=-added`, `RawgApiKey` from config, graceful skip without key); 500-page × 40-game loop (20,000 games, 1.5 s spacing, ~13 min full sync); background cycle 4 h → **24 h** for the 20k/month request limit; prices → nullable (`MakeGamePricesNullable` migration) with frontend hiding null price tags; hard-reset now fires the sync in the background and returns instantly |
| 6.1 | 15-game baseline seeding removed (catalog is RAWG-only, empty until first sync); serverless tuning: Npgsql `MinPoolSize=0` + 15 s idle lifetime, `SocketsHttpHandler` 15 s pooled-connection idle timeout so Railway Serverless can sleep |
| 7 | **Accounts + community feed**: JWT auth (`AuthController` register/login/me, `PasswordHasher<User>`, `JwtTokenService`, 30-day HS256 tokens from `Jwt:Secret`); `POST /api/users` removed; run initialize/report locked to the authenticated owner; `RunVote`/`RunComment`/`RunReaction` tables (`AddAuthAndCommunityFeed` migration); `FeedController` (Hot/New/Top paged feed with gravity decay, vote upsert, reaction toggle, flat comments); frontend `AuthProvider` + `SiteNav` + `/login`; homepage replaced by the community feed; Draft Room drops the user dropdown; run tracker shows WIN/LOSS only to the owner |
| 8 | **OBS overlay & dual control system**: server-side speedrun timer state on `Run` (`TimerStatus`/`TimerElapsedMs`/`TimerUpdatedAt`) + per-slot `SplitTimeMs` + per-run `OverlayKey` secret (`AddOverlayTimerState` migration); `OverlayController` (public GET state; toggle/split/undo/reset guarded by owner JWT or `?key=`); `/overlay/[runId]` OBS browser source (transparent, 3D cylindrical game wheel, neon `H:MM:SS.cc` timer, hotkeys Space/Enter/R×2/P); `/control/[runId]` control deck (Play/Pause, Split, Undo, two-step Reset, splits list, Copy OBS URL); `useOverlayRun` hook (2 s polling + BroadcastChannel fan-out) + `SpeedrunTimer` component; owner link to the deck from the run tracker. Also fixed run initialization 500 (`AsNoTracking` games attached to new slots made EF re-insert them → duplicate `PK_Games`) |
| 9 | **Hybrid catalog sorting**: `Game.IsFeatured` + `Game.PopularityRank` (`AddGameSortingFields` migration, composite index, exposed on `GameResponse`); `DbInitializer` seeds 12 curated competitive staples at `IsFeatured = true` / rank 0, promoting the existing row when RAWG already ingested the title; the RAWG loop assigns each game its running most-added index as `PopularityRank`; `UpsertGamesAsync` refreshes rank but treats featured as a one-way promotion; `GetAllAsync` orders featured → rank → title. Sync guard changed from "any game exists" to `HasIngestedCatalogAsync` (any **non-featured** game) so the new seed can't permanently suppress ingestion. Frontend: `featured` catalog sort mirroring the server comparator, now the Draft Room default |
| 10 | **Gauntlet Lite**: `RunType` enum (`Standard` = 10 games, `Lite` = 5) on `Run` (`AddRunTypeToRuns` migration, string-converted with a `Standard` default that backfills existing rows, `IX_Runs_RunType`); `RunTypes.SlotCount`/`TryParse` as the single source of truth, replacing `RunController.RequiredSlotCount = 10` in both the initialize count check and the completion check; `initialize` accepts an optional `runType`; `GET /api/leaderboard?runType=` ranks Standard and Lite separately (the positional multiplier makes a shared board meaningless); `runType`/`totalSlots` added to `RunResponse`, `LeaderboardEntryDto`, `OverlayStateDto`, and `FeedPostDto`. Frontend: Draft Room mode toggle that re-packs picks when resizing the board, `RunTypeBadge` (LITE MODE) on draft/tracker/deck/feed, dynamic `x/N` counters on the overlay and control deck, Standard/Lite leaderboard tabs. Also fixed a latent split: `OverlayController.Split` completed a run at its max slot position while `/report` completed only at position 10, so any non-10-slot run could finish on the overlay but never via the API |
| R1 | **Speedrun Records Phase 1 — Trust Schema**: `Category` / `Variable` / `VariableValue` (the rules engine, cascade-owned by mods) and `Submission` / `SubmissionVariable` (the verified ledger, restrict-delete everywhere) with `SubmissionStatus` (`Pending`/`Verified`/`Rejected` stored as strings), VOD-required `VideoUrl`, `PrimaryTimeMs > 0` check, examiner audit fields, leaderboard/PB/mod-queue indexes, and the `AddSpeedrunTrustSchema` migration (section 5d). No API surface yet — schema only |
