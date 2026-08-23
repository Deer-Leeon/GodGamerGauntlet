# PROJECT_STATE.md — GodGamerGauntlet Backend Ledger

> Living documentation for the godgamergauntlet.com backend. Update this file whenever the schema, API surface, or deployment story changes.
>
> **Last updated:** 2026-08-23 (Phase 1.5)

---

## 1. System Architecture & Tech Stack

| Layer | Technology |
|---|---|
| Runtime | .NET 8 (ASP.NET Core Web API, controller-based) |
| ORM | Entity Framework Core 8 (code-first migrations) |
| Database | PostgreSQL (Npgsql.EntityFrameworkCore.PostgreSQL 8) |
| API Docs | Swagger / Swashbuckle (Development environment only, at `/swagger`) |
| Hosting target | Railway (API + managed PostgreSQL) |
| Frontend (planned) | Next.js on Vercel (consumes this API via CORS policy `AllowFrontend`) |

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

- Allowed origins: `http://localhost:3000` and any `https://*.vercel.app` subdomain (wildcard subdomains enabled)
- Headers: all. Methods: all. Credentials: allowed.

---

## 7. Deployment Instructions

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

---

## 8. Phase History

| Phase | Scope |
|---|---|
| 1 | Project scaffold, EF Core + Npgsql, domain models, AppDbContext, Game/Run repositories, GameController, RunController with difficulty formula, InitialCreate migration |
| 1.5 | User management layer (repository + controller), DbInitializer (auto-migrate + seed 15 games + demo user), CORS `AllowFrontend`, this ledger |
