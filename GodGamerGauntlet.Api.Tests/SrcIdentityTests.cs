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
    public async Task Import_inserts_verified_solo_youtube_pbs_and_skips_the_rest()
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
            var runs = db.Submissions.Where(s => s.GameId == gameId).ToList();
            Assert.Single(runs);
            Assert.Equal("celrun1", runs[0].SrcRunId);
            Assert.Equal(SubmissionOrigin.SrcImport, runs[0].Origin);
            Assert.False(runs[0].IsObsolete);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            await importer.ImportGameAsync("celeste", CancellationToken.None);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, db.Submissions.Count(s => s.GameId == gameId));
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

        src.Leaderboards[FakeSrcClient.BoardKey("celesteid", "any1", null)] = new SrcLeaderboard
        {
            Runs =
            [
                new SrcLeaderboardRow
                {
                    Place = 1,
                    Run = Run("celrun1", "verified", 1, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", null, 120.5),
                },
                new SrcLeaderboardRow
                {
                    Place = 2,
                    Run = Run("ilrun", "verified", 1, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", "level1", 10),
                },
                new SrcLeaderboardRow
                {
                    Place = 3,
                    Run = Run("coop", "verified", 2, "https://www.youtube.com/watch?v=dQw4w9wgGcQ", null, 200),
                },
                new SrcLeaderboardRow
                {
                    Place = 4,
                    Run = Run("novid", "verified", 1, "https://vimeo.com/123", null, 90),
                },
            ],
        };
    }

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
