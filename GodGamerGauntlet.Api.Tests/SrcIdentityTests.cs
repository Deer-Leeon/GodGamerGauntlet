using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

public class SrcIdentityTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly CourtApiFactory _factory;

    public SrcIdentityTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username, string? SrcUserId);

    [Fact]
    public async Task Reserved_username_cannot_be_registered_or_taken()
    {
        var handle = "Rsv" + Guid.NewGuid().ToString("N")[..8];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                Username = handle,
                SrcUserId = "src" + Guid.NewGuid().ToString("N")[..8],
                IsReserved = true,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var register = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { username = handle, email = $"darb_{Guid.NewGuid():N}@test.local", password = "hunter2hunter2" });
        Assert.Equal(HttpStatusCode.Conflict, register.StatusCode);
        var body = await register.Content.ReadAsStringAsync();
        Assert.Contains("reserved", body, StringComparison.OrdinalIgnoreCase);

        var (other, _) = await RegisterAsync("srcoth");
        var rename = await other.PutAsJsonAsync("/api/auth/username", new { username = handle });
        Assert.Equal(HttpStatusCode.Conflict, rename.StatusCode);
    }

    [Fact]
    public async Task Claim_with_api_key_takes_reserved_handle_and_does_not_store_the_key()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        var key = "key-" + Guid.NewGuid().ToString("N");
        var srcId = "qjn" + Guid.NewGuid().ToString("N")[..5];
        var handle = "Chs" + Guid.NewGuid().ToString("N")[..8];
        src.ProfilesByKey[key] = new SrcUser
        {
            Id = srcId,
            Names = new SrcNames { International = handle },
        };

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var reserved = new User
            {
                Id = Guid.NewGuid(),
                Username = handle,
                SrcUserId = srcId,
                IsReserved = true,
                CreatedAt = DateTime.UtcNow,
            };
            db.Users.Add(reserved);
            db.UsernameReservations.Add(new UsernameReservation
            {
                Id = Guid.NewGuid(),
                UserId = reserved.Id,
                ReservedUsername = handle,
                SrcUserId = srcId,
                ReservedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var (client, _) = await RegisterAsync("claimer");
        var response = await client.PostAsJsonAsync("/api/src/claim", new { apiKey = key });
        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(handle, payload.GetProperty("user").GetProperty("username").GetString());
        Assert.Equal(srcId, payload.GetProperty("srcUserId").GetString());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var claimed = await db.Users.SingleAsync(u => u.SrcUserId == srcId);
            Assert.False(claimed.IsReserved);
            Assert.Equal(handle, claimed.Username);
            Assert.NotNull(claimed.PasswordHash);
            Assert.Empty(db.Users.Where(u => u.Username.StartsWith("_src_")));
        }

        Assert.Equal(key, src.LastApiKey);
    }

    [Fact]
    public async Task Wrong_api_key_is_forbidden()
    {
        var (client, _) = await RegisterAsync("badkey");
        var response = await client.PostAsJsonAsync("/api/src/claim", new { apiKey = "nope" });
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public void Embedded_run_players_and_platform_deserialize()
    {
        const string json = """
            {"data":[{
              "id":"run1",
              "players":{"data":[{"rel":"user","id":"user1","names":{"international":"Salmon"}}]},
              "platform":{"data":{"id":"plat1","name":"PC"}},
              "system":{"platform":"plat1","emulated":false,"region":null},
              "times":{"primary_t":1.5,"realtime_noloads_t":1.25},
              "status":{"status":"verified","reason":null}
            }]}
            """;

        var envelope = JsonSerializer.Deserialize<SrcDataEnvelope<List<SrcRun>>>(json, Json);
        var run = Assert.Single(envelope!.Data!);
        Assert.Equal("Salmon", run.Players![0].Names!.International);
        Assert.Equal("plat1", SrcRunIds.AsId(run.Platform));
        Assert.Equal(1.25, run.Times!.RealtimeNoloadsT);
    }

    [Fact]
    public async Task Bulk_import_is_off_until_the_license_flag_is_set()
    {
        var (client, userId) = await RegisterAsync("adminx");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.FindAsync(userId);
            user!.IsAdmin = true;
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsync("/api/admin/src/import", null);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Import_stores_verified_runs_with_levels_players_and_proof_links()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        SeedFlagshipBoard(src);

        Guid gameId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var game = await db.Games.FirstOrDefaultAsync(g => g.Title == "Celeste")
                ?? db.Games.Add(new Game
                {
                    Id = Guid.NewGuid(),
                    Title = "Celeste",
                    BaseDifficulty = 70,
                }).Entity;
            await db.SaveChangesAsync();
            gameId = game.Id;
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            await importer.ImportGameAsync("celeste", CancellationToken.None);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var runs = await db.Submissions
                .Include(s => s.Players)
                .Include(s => s.Proofs)
                .Where(s => s.GameId == gameId)
                .ToListAsync();
            Assert.Equal(4, runs.Count);
            Assert.All(runs, r => Assert.Equal(SubmissionOrigin.SrcImport, r.Origin));

            var fullGame = runs.Single(r => r.SrcRunId == "celrun1");
            Assert.Null(fullGame.LevelId);
            Assert.True(fullGame.IsObsolete);

            var levelRun = runs.Single(r => r.SrcRunId == "ilrun");
            Assert.NotNull(levelRun.LevelId);
            Assert.False(levelRun.IsObsolete);

            var coop = runs.Single(r => r.SrcRunId == "coop");
            Assert.Equal(2, coop.Players.Count);

            var otherHost = runs.Single(r => r.SrcRunId == "novid");
            Assert.Contains("vimeo.com", otherHost.VideoUrl);
            Assert.False(otherHost.IsObsolete);

            var anon = _factory.CreateClient();
            var records = await anon.GetFromJsonAsync<JsonElement>(
                $"/api/games/{gameId}/records", Json);
            Assert.True(records.GetProperty("levels").GetArrayLength() >= 1);
            Assert.Equal(0, records.GetProperty("levelCategories").GetArrayLength());
            Assert.Contains(
                records.GetProperty("categories").EnumerateArray(),
                item => item.GetProperty("name").GetString() == "Any%");

            var fullBoard = await anon.GetFromJsonAsync<JsonElement>(
                $"/api/games/{gameId}/categories/{fullGame.CategoryId}/leaderboard", Json);
            var fullIds = fullBoard.EnumerateArray()
                .Select(row => row.GetProperty("submissionId").GetGuid())
                .ToList();
            Assert.Contains(otherHost.Id, fullIds);
            Assert.DoesNotContain(levelRun.Id, fullIds);

            var levelBoard = await anon.GetFromJsonAsync<JsonElement>(
                $"/api/games/{gameId}/categories/{fullGame.CategoryId}/leaderboard?levelId={levelRun.LevelId}",
                Json);
            var levelIds = levelBoard.EnumerateArray()
                .Select(row => row.GetProperty("submissionId").GetGuid())
                .ToList();
            Assert.Contains(levelRun.Id, levelIds);
            Assert.DoesNotContain(otherHost.Id, levelIds);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            await importer.ImportGameAsync("celeste", CancellationToken.None);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(4, db.Submissions.Count(s => s.GameId == gameId));
        }
    }

    private static void SeedFlagshipBoard(FakeSrcClient src)
    {
        var category = new SrcCategory
        {
            Id = "any1",
            Name = "Any%",
            Type = "per-game",
            Miscellaneous = false,
        };
        src.Games["celeste"] = new SrcGame
        {
            Id = "celesteid",
            Abbreviation = "celeste",
            Weblink = "https://www.speedrun.com/celeste",
            Names = new SrcNames { International = "Celeste" },
            Categories = new SrcEmbed<List<SrcCategory>> { Data = [category] },
            Variables = new SrcEmbed<List<SrcVariable>> { Data = [] },
        };

        SrcRun Run(string id, string status, int players, string? video, object? level, double seconds) => new()
        {
            Id = id,
            Game = "celesteid",
            Category = "any1",
            Status = new SrcRunStatus { Status = status },
            Level = level,
            Times = new SrcTimes { PrimaryT = seconds },
            Videos = video is null ? null : new SrcVideos { Links = [new SrcVideoLink { Uri = video }] },
            Players = Enumerable.Range(0, players).Select(i => new SrcPlayer
            {
                Rel = "user",
                Id = "p" + i,
                Names = new SrcNames { International = "Runner" + i },
            }).ToList(),
            Date = "2020-01-01",
            Values = [],
        };

        var runs = new[]
        {
            Run("celrun1", "verified", 1, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", null, 120.5),
            Run("ilrun", "verified", 1, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", "level1", 10),
            Run("coop", "verified", 2, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", null, 200),
            Run("novid", "verified", 1, "https://vimeo.com/123", null, 90),
        };
        src.Runs.RemoveAll(run => SrcRunIds.AsId(run.Game) == "celesteid");
        src.Runs.AddRange(runs);
        src.Leaderboards[FakeSrcClient.BoardKey("celesteid", "any1", null)] = new SrcLeaderboard
        {
            Runs = runs.Select((run, index) => new SrcLeaderboardRow { Place = index + 1, Run = run }).ToList(),
        };
    }

    [Fact]
    public async Task Import_pages_runs_until_the_source_is_exhausted()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        src.Games["portal"] = Game("portal", "portalid", "Portal", "inb", "Inbounds");
        src.Runs.RemoveAll(run => SrcRunIds.AsId(run.Game) == "portalid");
        src.Runs.Add(PagedRun("portalid", "inb", "pgrun1", "verified", 10));
        src.Runs.Add(PagedRun("portalid", "inb", "pgrun2", "verified", 20));
        src.Runs.Add(PagedRun("portalid", "inb", "pgrun3", "verified", 30));
        src.RunRequests = 0;

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            await importer.ImportGameAsync("portal", CancellationToken.None);
        }

        Assert.Equal(2, src.RunRequests);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var game = await db.Games.SingleAsync(g => g.Title == "Portal");
            Assert.Equal(3, await db.Submissions.CountAsync(
                s => s.GameId == game.Id && s.Origin == SubmissionOrigin.SrcImport));
        }
    }

    [Fact]
    public async Task Import_splits_a_partition_before_the_offset_cap()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        src.Games["sm64"] = new SrcGame
        {
            Id = "sm64id",
            Abbreviation = "sm64",
            Names = new SrcNames { International = "Super Mario 64" },
            Categories = new SrcEmbed<List<SrcCategory>>
            {
                Data = [new SrcCategory { Id = "nmg", Name = "16 Star", Type = "per-game" }],
            },
            Levels = new SrcEmbed<List<SrcLevel>>
            {
                Data =
                [
                    new SrcLevel { Id = "bob", Name = "Bob-omb Battlefield" },
                    new SrcLevel { Id = "wf", Name = "Whomp's Fortress" },
                ],
            },
            Platforms = new SrcEmbed<List<SrcNamed>>
            {
                Data =
                [
                    new SrcNamed { Id = "n64", Name = "N64" },
                    new SrcNamed { Id = "wii", Name = "Wii VC" },
                ],
            },
            Variables = new SrcEmbed<List<SrcVariable>> { Data = [] },
        };
        src.RunRequests = 0;

        Guid gameId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var game = await db.Games.SingleAsync(g => g.Title == "Super Mario 64");
            gameId = game.Id;
            var stale = await db.SrcImportCursors.Where(c => c.GameId == gameId).ToListAsync();
            db.SrcImportCursors.RemoveRange(stale);
            db.SrcImportCursors.Add(new SrcImportCursor
            {
                Id = Guid.NewGuid(),
                GameId = gameId,
                IsStructure = true,
                UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            Assert.True(await importer.ProcessNextAsync(gameId, CancellationToken.None));
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var open = await db.SrcImportCursors
                .Where(c => c.GameId == gameId && !c.IsStructure && !c.Completed)
                .ToListAsync();
            Assert.NotEmpty(open);
            foreach (var cursor in open) cursor.Offset = SrcImportService.RunOffsetCap;
            await db.SaveChangesAsync();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            Assert.True(await importer.ProcessNextAsync(gameId, CancellationToken.None));
        }

        Assert.Equal(0, src.RunRequests);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(2, await db.GameLevels.CountAsync(l => l.GameId == gameId));
            var superseded = await db.SrcImportCursors.SingleAsync(c => c.GameId == gameId && c.Superseded);
            var children = await db.SrcImportCursors
                .Where(c => c.GameId == gameId && c.PlatformSrcId != "" && !c.Superseded)
                .ToListAsync();
            Assert.Equal(2, children.Count);
            Assert.All(children, child =>
            {
                Assert.Equal(superseded.CategorySrcId, child.CategorySrcId);
                Assert.Equal(superseded.Status, child.Status);
                Assert.Equal("", child.LevelSrcId);
                Assert.Equal(0, child.Offset);
            });
            Assert.Contains(children, child => child.PlatformSrcId == "n64");
            Assert.Contains(children, child => child.PlatformSrcId == "wii");
        }
    }

    [Fact]
    public async Task Import_stores_verified_runs_and_updates_them_in_place()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        src.Games["cuphead"] = Game("cuphead", "cupid", "Cuphead", "anyc", "Any%");
        var run = PagedRun("cupid", "anyc", "cuprun", "verified", 12, noloads: 9.5, splits: "https://splits.io/cup");
        src.Runs.RemoveAll(existing => SrcRunIds.AsId(existing.Game) == "cupid");
        src.Runs.Add(run);
        src.Runs.Add(PagedRun("cupid", "anyc", "cupnew", "new", 15));
        src.Runs.Add(PagedRun("cupid", "anyc", "cuprej", "rejected", 18));

        await ImportAbbreviation("cuphead");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var row = await db.Submissions.Include(s => s.Proofs).SingleAsync(s => s.SrcRunId == "cuprun");
            Assert.Equal(SubmissionStatus.Verified, row.Status);
            Assert.Equal(9500, row.RealtimeNoloadsMs);
            Assert.Contains(row.Proofs, proof => proof.Url.Contains("splits.io", StringComparison.OrdinalIgnoreCase));
            Assert.Equal(0, await db.Submissions.CountAsync(s => s.SrcRunId == "cupnew" || s.SrcRunId == "cuprej"));
        }

        run.Times = new SrcTimes { PrimaryT = 11, RealtimeNoloadsT = 9.5 };
        run.Status = new SrcRunStatus
        {
            Status = "verified",
            Examiner = "mod9",
            VerifyDate = "2024-01-02T00:00:00Z",
        };
        await ImportAbbreviation("cuphead");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var rows = await db.Submissions.Where(s => s.SrcRunId == "cuprun").ToListAsync();
            var row = Assert.Single(rows);
            Assert.Equal(11_000, row.PrimaryTimeMs);
            Assert.Equal(SubmissionStatus.Verified, row.Status);
            Assert.Equal("mod9", row.VerifierSrcId);
            Assert.Equal(0, await db.Submissions.CountAsync(s => s.SrcRunId == "cupnew" || s.SrcRunId == "cuprej"));
        }
    }

    [Fact]
    public async Task Imported_pending_runs_stay_out_of_the_mod_queue()
    {
        var (admin, adminId) = await RegisterAsync("modqueue");
        Guid nativeId;
        Guid importedId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = await db.Users.FindAsync(adminId);
            user!.IsAdmin = true;
            var game = await db.Games.SingleAsync(g => g.Title == "Minecraft: Java Edition");
            var category = new Category
            {
                Id = Guid.NewGuid(),
                GameId = game.Id,
                Name = "Queue " + Guid.NewGuid().ToString("N")[..8],
                CreatedAt = DateTime.UtcNow,
            };
            var native = QueueRun(game.Id, category.Id, user.Id, SubmissionOrigin.Native, null);
            var imported = QueueRun(game.Id, category.Id, user.Id, SubmissionOrigin.SrcImport, "srcpend1");
            db.Categories.Add(category);
            db.Submissions.AddRange(native, imported);
            await db.SaveChangesAsync();
            nativeId = native.Id;
            importedId = imported.Id;
        }

        var queue = await admin.GetAsync("/api/moderation/queue");
        queue.EnsureSuccessStatusCode();
        var body = await queue.Content.ReadFromJsonAsync<JsonElement>(Json);
        var ids = body.EnumerateArray().Select(row => row.GetProperty("submissionId").GetGuid()).ToList();
        Assert.Contains(nativeId, ids);
        Assert.DoesNotContain(importedId, ids);
    }

    private async Task ImportAbbreviation(string abbreviation)
    {
        using var scope = _factory.Services.CreateScope();
        var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
        await importer.ImportGameAsync(abbreviation, CancellationToken.None);
    }

    private static SrcGame Game(
        string abbreviation, string id, string title, string categoryId, string categoryName) => new()
    {
        Id = id,
        Abbreviation = abbreviation,
        Names = new SrcNames { International = title },
        Categories = new SrcEmbed<List<SrcCategory>>
        {
            Data = [new SrcCategory { Id = categoryId, Name = categoryName, Type = "per-game" }],
        },
        Variables = new SrcEmbed<List<SrcVariable>> { Data = [] },
    };

    private static SrcRun PagedRun(
        string gameId,
        string categoryId,
        string id,
        string status,
        double seconds,
        double? noloads = null,
        string? splits = null) => new()
    {
        Id = id,
        Game = gameId,
        Category = categoryId,
        Status = new SrcRunStatus { Status = status },
        Times = new SrcTimes { PrimaryT = seconds, RealtimeNoloadsT = noloads },
        Videos = new SrcVideos { Links = [new SrcVideoLink { Uri = "https://www.youtube.com/watch?v=dQw4w9wgGcQ" }] },
        Splits = splits is null ? null : new SrcSplits { Uri = splits },
        Players =
        [
            new SrcPlayer
            {
                Rel = "user",
                Id = "u" + id,
                Names = new SrcNames { International = "Runner " + id },
            },
        ],
        Date = "2020-01-01",
        Values = [],
    };

    private static Submission QueueRun(
        Guid gameId, Guid categoryId, Guid playerId, SubmissionOrigin origin, string? srcRunId) => new()
    {
        Id = Guid.NewGuid(),
        GameId = gameId,
        CategoryId = categoryId,
        PlayerId = playerId,
        PrimaryTimeMs = 5_000,
        VideoUrl = "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
        PlayedOn = DateTimeOffset.UtcNow,
        Status = SubmissionStatus.Pending,
        Origin = origin,
        SrcRunId = srcRunId,
        SubmittedAt = DateTime.UtcNow,
    };

    private async Task<(HttpClient Client, Guid UserId)> RegisterAsync(string prefix)
    {
        var client = _factory.CreateClient();
        var username = $"{prefix}_{Guid.NewGuid():N}"[..20];
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { username, email = $"{username}@test.local", password = "hunter2hunter2" });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(Json);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth!.Token);
        return (client, auth.User.Id);
    }
}
