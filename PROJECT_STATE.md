# PROJECT_STATE.md — GodGamerGauntlet Backend Ledger

> Living documentation for the godgamergauntlet.com backend. Update this file whenever the schema, API surface, or deployment story changes.
>
> **Last updated:** 2026-08-23 (Phase 5.2 — On-Demand Sync Service & 4h Refresh)

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

Controller → Repository → `AppDbContext` → PostgreSQL. Controllers hold request validation and business orchestration; repositories own all database access behind interfaces (`IGameRepository`, `IRunRepository`, `IUserRepository`) registered as scoped services. DTO records in `Contracts/` decouple the wire format from EF entities.

### Project layout

```
GodGamerGauntlet.Api/
├── Contracts/          # Request/response DTO records (GameDtos, RunDtos, UserDtos)
├── Controllers/        # GameController, RunController, UserController
├── Data/               # AppDbContext, DbInitializer (auto-migrate + seed)
├── Migrations/         # EF Core migrations (InitialCreate)
├── Models/             # User, Game, Run, RunSlot, RunStatus, RunSlotStatus
├── Repositories/       # Interfaces + EF implementations
├── Program.cs          # DI, CORS, startup migration/seeding, pipeline
└── appsettings.json    # ConnectionStrings:DefaultConnection

GodGamerGauntlet.Web/
├── .env.local          # NEXT_PUBLIC_API_URL (gitignored; localhost:5000 or Railway URL)
└── src/
    ├── app/
    │   ├── globals.css     # Tailwind v4 @theme design tokens + panel utility
    │   ├── layout.tsx      # Fonts, metadata, bg-dark body
    │   ├── page.tsx        # Landing page → /draft
    │   └── draft/page.tsx  # The Draft Room (client component)
    └── lib/api.ts          # Typed API client (getGames, getUsers, initializeRun)
```

### Startup behavior

On every boot, `DbInitializer.InitializeAsync` runs inside a scoped service provider:

1. `Database.MigrateAsync()` applies any pending EF migrations.
2. If the `Games` table is empty, seeds the 15-game catalog (section 5).
3. If the `Users` table is empty, seeds the demo user `GodGamerDemo`.

---

## 2. Database Schema

All primary keys are `uuid` (Guid, generated in application code). Enums are stored as strings for readability.

### Users

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| Username | varchar(50) | NOT NULL, **unique index** |
| CreatedAt | timestamptz | NOT NULL |

### Games

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| Title | varchar(200) | NOT NULL |
| BaseDifficulty | int | NOT NULL, CHECK `1 ≤ BaseDifficulty ≤ 100` (`CK_Games_BaseDifficulty`) |
| ExternalId | varchar(50) | NULL (CheapShark gameID), **unique index** |
| Thumb | varchar(500) | NULL (cover thumbnail URL, Steam CDN) |
| NormalPrice | numeric(10,2) | NOT NULL (0 for hand-seeded games) |
| SalePrice | numeric(10,2) | NOT NULL (0 for hand-seeded games) |

### Runs

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| UserId | uuid | FK → Users.Id, **cascade delete** |
| StartTime | timestamptz | NOT NULL |
| EndTime | timestamptz | NULL (set when run ends) |
| Status | varchar(20) | NOT NULL, enum string: `Active` \| `Failed` \| `Completed` |
| TotalDifficultyScore | double precision | NOT NULL |

### RunSlots

| Column | Type | Constraints |
|---|---|---|
| Id | uuid | PK |
| RunId | uuid | FK → Runs.Id, **cascade delete** |
| GameId | uuid | FK → Games.Id, **delete restricted** |
| Position | int | NOT NULL, CHECK `1 ≤ Position ≤ 10` (`CK_RunSlots_Position`) |
| Status | varchar(20) | NOT NULL, enum string: `Pending` \| `Won` \| `Lost` |

**Unique index:** `(RunId, Position)` — a run can never have two slots at the same position.

### Relationships

- `User 1 ── * Run` (cascade delete)
- `Run 1 ── * RunSlot` (max 10 enforced by API + position check constraint; cascade delete)
- `RunSlot * ── 1 Game` (restrict delete: games referenced by slots cannot be removed)

### Migrations

| Migration | Status |
|---|---|
| `20260823204713_InitialCreate` | Generated; applied automatically at startup via `MigrateAsync()` |
| `20260824011412_AddCheapSharkGameFields` | Adds ExternalId/Thumb/NormalPrice/SalePrice to Games; auto-applied at startup |

---

## 3. REST API Specification

Base route pattern: `/api/{resource}`. All bodies are JSON. Validation errors return `400` with ASP.NET problem details.

### Users

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/users` | `{ "username": "string (3-50 chars)" }` | `201` → User object | `400` invalid body, `409` username taken |
| GET | `/api/users` | — | `200` → `User[]` | — |
| GET | `/api/users/{id}` | — | `200` → User | `404` not found |

User object: `{ "id": "uuid", "username": "string", "createdAt": "ISO-8601 UTC" }`

### Games

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/games` | — | `200` → `Game[]` (sorted by title) | — |
| POST | `/api/games` | `{ "title": "string (≤200)", "baseDifficulty": 1-100 }` | `201` → Game | `400` invalid body |
| GET | `/api/games/{id}` | — | `200` → Game | `404` not found |

Game object: `{ "id": "uuid", "title": "string", "baseDifficulty": int, "thumb": "url | null", "normalPrice": decimal, "salePrice": decimal }`

### Runs

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/runs/initialize` | `{ "userId": "uuid", "gameIds": ["uuid" × 10, ordered by slot position] }` | `201` → Run object | `400` wrong count / unknown user / unknown game ids |
| GET | `/api/runs/{id}` | — | `200` → Run (ordered slots) | `404` not found |
| POST | `/api/runs/{id}/report` | `{ "slotPosition": 1-10, "result": "Won" \| "Lost" }` | `200` → updated Run | `400` state-machine violation (below), `404` unknown run |

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
| GET | `/api/leaderboard` | — | `200` → `LeaderboardEntry[]` (top 50) | — |

Entry object: `{ "runId": "uuid", "streamerName": "string", "totalScore": double, "status": "Completed" | "Failed", "slotsCompleted": int, "endTime": "ISO-8601" | null }`

Query semantics (single SQL query via EF projection in `RunRepository.GetLeaderboardAsync`):

- Only finished runs (`Status != Active`).
- `totalScore` is the **earned** score — the slot formula summed over `Won` slots only (a failed run keeps the points from slots it survived; this differs from the run's stored `TotalDifficultyScore`, which is the projected total for all 10 slots).
- Ordering: earned score desc → `Completed` before `Failed` on ties → most recent `EndTime` first. Top 50 returned.

### Admin

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/admin/hard-reset` | — | `200` → `{ message, runsDeleted, slotsDeleted, gamesDeleted, cheapSharkGamesProcessed, cheapSharkGamesAdded }` | — |

Hard reset wipes RunSlots → Runs → Games (in that order — RunSlots reference Games with restrict-delete) using EF Core 8 `ExecuteDeleteAsync()` bulk deletes, calls `DbInitializer.SeedAsync` to restore the 15 hand-curated baseline games, then **awaits the CheapShark sync inline** so the full catalog is live before the request returns (~2–5 s: two CheapShark calls spaced 1.5 s apart). **Users are preserved.** ⚠️ Currently unauthenticated — lock down before exposing publicly.

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

**Games (15):** Street Fighter 6 (85), Fall Guys (65), GeoGuessr (75), Chess.com (80), Getting Over It (90), Mario Kart 8 Deluxe (60), Brawlhalla (70), Rocket League (85), Apex Legends (90), Trackmania (75), Lethal Company (50), Overwatch 2 (80), Tetris 99 (75), Tekken 8 (85), Valorant (90)

**Users (1):** `GodGamerDemo`

Since Phase 5 the seeded games are a curated baseline only — the live catalog grows automatically via the CheapShark sync (section 5a). Seeded games keep `Thumb = null` and prices at 0 until CheapShark carries a deal matching their title.

---

## 5a. CheapShark Catalog Ingestion (Phase 5)

The browser never calls CheapShark. All ingestion happens server-side:

```
CheapShark API (deals, storeID=1 Steam)
        │  HTTPS, typed client + resilience handler (Polly retries/backoff)
        ▼
IGameSyncService / GameSyncService (scoped — the actual ingestion)
        ▲                          ▲
        │ DI scope per cycle       │ awaited inline
GameSyncBackgroundService     AdminController hard-reset
(startup + every 4 hours)     (on-demand instant sync)
        │
        ▼
IGameRepository.UpsertGamesAsync → PostgreSQL Games table
```

### Components

- **`Services/CheapSharkClient.cs`** — typed `HttpClient` wrapper. Base address `https://www.cheapshark.com/`, 30s timeout, `AddStandardResilienceHandler()` (retries with backoff on transient faults). Sends `User-Agent: GodGamerGauntlet/1.0 (godgamergauntlet.com)` — **CheapShark returns 400 for missing/generic User-Agent headers.**
- **`Services/CheapSharkDeal.cs`** — JSON model for a deal row (`gameID`, `title`, `thumb`, `normalPrice`, `salePrice`, `metacriticScore`, `steamRatingPercent`).
- **`Services/IGameSyncService.cs` / `GameSyncService.cs`** — scoped service holding the actual ingestion: two targeted queries spaced by a **strict 1500 ms delay** (rate-limit compliance), deduplication by `gameID`, mapping to `Game`, upsert. Returns `GameSyncResult(GamesProcessed, GamesAdded)`. Callable on demand (admin hard-reset) and on schedule.
- **`Services/GameSyncBackgroundService.cs`** — hosted service that only schedules: resolves `IGameSyncService` in a fresh DI scope **on startup and every 4 hours** (shortened from 12 h in Phase 5.2 for fresher pricing). Failures are logged and retried next cycle — the host never crashes over a failed sync.

### Dual-pass curated queries (Phase 5.1)

| Pass | Query | Purpose |
|---|---|---|
| 1 — AAA Hits | `deals?storeID=1&AAA=1&sortBy=Reviews&pageSize=60` | Big-name AAA titles by review volume |
| 2 — Highly Rated | `deals?storeID=1&metacritic=80&minimumReviewCount=1000&sortBy=DealRating&pageSize=60` | Critically acclaimed games (Metacritic 80+, 1000+ Steam reviews) |

Results are combined and deduplicated by `gameID` (the AAA pass wins ties) before the upsert. **API quirk:** CheapShark's `sortBy=Reviews` is already descending; passing `desc=1` inverts it and returns the *least*-reviewed games, so it is deliberately omitted.

### Upsert semantics (`GameRepository.UpsertGamesAsync`)

- Match existing rows by `ExternalId` first, then case-insensitive title.
- Matched rows: refresh `Thumb`, `NormalPrice`, `SalePrice`, backfill `ExternalId` — but **never overwrite the curated `BaseDifficulty`** of seeded games.
- Unmatched rows are inserted; returns the count of newly added games.

### Difficulty derivation for ingested games

CheapShark has no difficulty concept, so ingested games derive `BaseDifficulty` from review data: Metacritic score when present (> 0), else Steam rating percent, else a default of 70 — clamped to the 1–100 check constraint.

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
4. `UseAuthorization` → `MapControllers`.

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

Typed wrappers over `fetch` against `NEXT_PUBLIC_API_URL`: `getGames(): Promise<Game[]>`, `getUsers(): Promise<User[]>`, `initializeRun(userId, gameIds): Promise<Run>`. Interfaces mirror the API's camelCase JSON (`User`, `Game`, `Run`, `RunSlot`, status string unions). Non-2xx responses throw with the response body as the message.

### Routes

| Route | Purpose |
|---|---|
| `/` | Landing page with CTA into the Draft Room |
| `/draft` | The Draft Room (below) |
| `/run/[id]` | Live Run Tracker — header with streamer, status badge (cyan Active / red Failed / gold Completed) and total score; 10-slot board where won slots show earned score in cyan, the current slot glows with RECORD WIN / RECORD LOSS buttons, future slots are dimmed, and a lost slot shows the death state and locks the board; "Start a New Run" + "View Leaderboard" links when the run is over |
| `/leaderboard` | Global Leaderboard — top-50 finished runs with rank (gold #FFD700 / silver #C0C0C0 / bronze #CD7F32 for the podium), streamer, earned score, slots survived (`n/10`), Completed/Failed badge, and finish time; "Draft a New Run" CTA. Linked from the home page, the Draft Room header, and the run tracker end state |

### The Draft Room (`/draft`)

Client component with this flow:

1. **User selector** — dropdown of all users, defaults to `GodGamerDemo`.
2. **Game catalog** — grid of the live database catalog (CheapShark-ingested + seeded games): rounded cover thumbnail (letter placeholder when absent), title, base difficulty, and price — sale price in cyan with the normal price struck through when discounted. "Add to Draft" fills the first empty slot; a game can be drafted only once.
3. **Gauntlet board** — 10 numbered slots showing per-slot math (`base × multiplier = slot score`), with move up/down and remove controls.
4. **Live score header** — sticky scoreboard recalculating `Total Projected Score` client-side with the same formula the API uses (section 4).
5. **Launch Gauntlet** — enabled only at 10/10 slots; POSTs to `/api/runs/initialize`, then shows the returned Run ID, server-calculated score, and a link to `/run/{id}`.

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
