# PROJECT_STATE.md — GodGamerGauntlet Backend Ledger

> Living documentation for the godgamergauntlet.com backend. Update this file whenever the schema, API surface, or deployment story changes.
>
> **Last updated:** 2026-08-23 (Phase 2.2 — proxy-aware middleware pipeline)

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

Game object: `{ "id": "uuid", "title": "string", "baseDifficulty": int }`

### Runs

| Method | Route | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/api/runs/initialize` | `{ "userId": "uuid", "gameIds": ["uuid" × 10, ordered by slot position] }` | `201` → Run object | `400` wrong count / unknown user / unknown game ids |
| GET | `/api/runs/{id}` | — | `200` → Run (slots incl. game data) | `404` not found |

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
| `/run/[id]` | Live run tracker — **planned, Phase 3** (linked from the draft success state) |

### The Draft Room (`/draft`)

Client component with this flow:

1. **User selector** — dropdown of all users, defaults to `GodGamerDemo`.
2. **Game catalog** — grid of seeded games (title + base difficulty); "Add to Draft" fills the first empty slot; a game can be drafted only once.
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
