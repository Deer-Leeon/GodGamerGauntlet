using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>
/// Phase 9: the global arena. Score = sum of beaten slots' BaseDifficulty;
/// equal scores favor the faster gauntlet clock; run types never mix.
/// </summary>
public class ArenaTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public ArenaTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username);

    private async Task<(Guid UserId, string Username)> RegisterAsync(string prefix)
    {
        var client = _factory.CreateClient();
        var username = $"{prefix}_{Guid.NewGuid():N}"[..20];
        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { username, email = $"{username}@test.local", password = "hunter2hunter2" });
        response.EnsureSuccessStatusCode();
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(Json);
        return (auth!.User.Id, auth.User.Username);
    }

    /// <summary>A finished gauntlet with one Won slot per difficulty given.</summary>
    private static Run MakeClear(
        Guid userId, RunType runType, long elapsedMs, DateTime endTime, params Game[] beaten)
    {
        var run = new Run
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            StartTime = endTime.AddHours(-2),
            EndTime = endTime,
            Status = RunStatus.Completed,
            RunType = runType,
            TimerStatus = "finished",
            TimerElapsedMs = elapsedMs,
        };
        for (var i = 0; i < beaten.Length; i++)
        {
            run.Slots.Add(new RunSlot
            {
                Id = Guid.NewGuid(),
                GameId = beaten[i].Id,
                Position = i + 1,
                Status = RunSlotStatus.Won,
                SplitTimeMs = (i + 1) * 600_000,
            });
        }
        return run;
    }

    [Fact]
    public async Task Scores_sum_beaten_difficulty_ties_favor_the_faster_clock_and_types_stay_separate()
    {
        var (slowId, slowName) = await RegisterAsync("arena_slow");
        var (fastId, fastName) = await RegisterAsync("arena_fast");
        var (untimedId, untimedName) = await RegisterAsync("arena_notime");
        var (liteId, liteName) = await RegisterAsync("arena_lite");
        var names = new[] { slowName, fastName, untimedName, liteName };

        Guid fastRunId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var fast = await db.Users.FindAsync(fastId);
            fast!.AvatarUrl = "https://cdn.test/fast.png";

            var g60 = new Game { Id = Guid.NewGuid(), Title = "Arena Sixty", Thumb = "https://cdn.test/60.jpg", BaseDifficulty = 60 };
            var g40 = new Game { Id = Guid.NewGuid(), Title = "Arena Forty", BaseDifficulty = 40 };
            var g99 = new Game { Id = Guid.NewGuid(), Title = "Arena NinetyNine", BaseDifficulty = 99 };
            db.AddRange(g60, g40, g99);

            var end = DateTime.UtcNow.AddDays(-1);
            // Identical 100-point lineups; the clock decides the podium.
            var slowRun = MakeClear(slowId, RunType.Standard, 5_000_000, end.AddMinutes(3), g60, g40);
            var fastRun = MakeClear(fastId, RunType.Standard, 4_000_000, end.AddMinutes(1), g60, g40);
            // Same score but the timer was never used: loses every tie.
            var untimedRun = MakeClear(untimedId, RunType.Standard, 0, end.AddMinutes(9), g60, g40);
            // A monster Lite score must never leak onto the Standard board.
            var liteRun = MakeClear(liteId, RunType.Lite, 1_000_000, end, g99, g60, g40);
            fastRunId = fastRun.Id;

            db.AddRange(slowRun, fastRun, untimedRun, liteRun);
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var standard = JsonDocument.Parse(await (await client.GetAsync(
                "/api/leaderboard?runType=Standard&limit=50"))
            .Content.ReadAsStringAsync()).RootElement;

        var ours = standard.EnumerateArray()
            .Where(e => names.Contains(e.GetProperty("streamerName").GetString()))
            .ToArray();

        // Only the three Standard clears, ranked fast → slow → untimed.
        Assert.Equal(
            new[] { fastName, slowName, untimedName },
            ours.Select(e => e.GetProperty("streamerName").GetString()).ToArray());

        var winner = ours[0];
        Assert.Equal(fastRunId, winner.GetProperty("runId").GetGuid());
        Assert.Equal(100, winner.GetProperty("totalScore").GetDouble());
        Assert.Equal(4_000_000, winner.GetProperty("elapsedMs").GetInt64());
        Assert.Equal("https://cdn.test/fast.png", winner.GetProperty("avatarUrl").GetString());

        // The inspect-wheel payload: drafted lineup in slot order with splits.
        var wheel = winner.GetProperty("games").EnumerateArray().ToArray();
        Assert.Equal(2, wheel.Length);
        Assert.Equal("Arena Sixty", wheel[0].GetProperty("title").GetString());
        Assert.Equal(60, wheel[0].GetProperty("baseDifficulty").GetInt32());
        Assert.Equal("Won", wheel[0].GetProperty("status").GetString());
        Assert.Equal(600_000, wheel[0].GetProperty("splitTimeMs").GetInt64());
        Assert.Equal(2, wheel[1].GetProperty("position").GetInt32());

        // Type isolation, both directions.
        var lite = JsonDocument.Parse(await (await client.GetAsync(
                "/api/leaderboard?runType=Lite&limit=50"))
            .Content.ReadAsStringAsync()).RootElement;
        var liteOurs = lite.EnumerateArray()
            .Where(e => names.Contains(e.GetProperty("streamerName").GetString()))
            .ToArray();
        var liteEntry = Assert.Single(liteOurs);
        Assert.Equal(liteName, liteEntry.GetProperty("streamerName").GetString());
        Assert.Equal(199, liteEntry.GetProperty("totalScore").GetDouble());
    }

    [Fact]
    public async Task Marathon_and_sprint_boards_stay_separate()
    {
        var (marathonId, marathonName) = await RegisterAsync("arena_mar");
        var (sprintId, sprintName) = await RegisterAsync("arena_spr");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var g60 = new Game { Id = Guid.NewGuid(), Title = "Sep Sixty", BaseDifficulty = 60 };
            var g40 = new Game { Id = Guid.NewGuid(), Title = "Sep Forty", BaseDifficulty = 40 };
            var g50 = new Game { Id = Guid.NewGuid(), Title = "Sep Fifty", BaseDifficulty = 50 };
            db.AddRange(g60, g40, g50);
            var end = DateTime.UtcNow.AddDays(-2);
            db.Add(MakeClear(marathonId, RunType.Marathon, 3_000_000, end, g60, g40, g50));
            db.Add(MakeClear(sprintId, RunType.Sprint, 1_000_000, end, g60, g40, g50));
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var marathon = JsonDocument.Parse(await (await client.GetAsync(
                "/api/leaderboard?runType=Marathon&limit=50"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Contains(marathon.EnumerateArray(), e => e.GetProperty("streamerName").GetString() == marathonName);
        Assert.DoesNotContain(marathon.EnumerateArray(), e => e.GetProperty("streamerName").GetString() == sprintName);

        var sprint = JsonDocument.Parse(await (await client.GetAsync(
                "/api/leaderboard?runType=Sprint&limit=50"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Contains(sprint.EnumerateArray(), e => e.GetProperty("streamerName").GetString() == sprintName);
        Assert.DoesNotContain(sprint.EnumerateArray(), e => e.GetProperty("streamerName").GetString() == marathonName);
    }

    [Fact]
    public async Task Initialize_accepts_sprint_and_rejects_legacy_or_wrong_length()
    {
        var client = _factory.CreateClient();
        var username = $"init_{Guid.NewGuid():N}"[..20];
        var register = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { username, email = $"{username}@test.local", password = "hunter2hunter2" });
        register.EnsureSuccessStatusCode();
        var auth = await register.Content.ReadFromJsonAsync<AuthResponse>(Json);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", auth!.Token);

        var gamesJson = JsonDocument.Parse(await (await client.GetAsync("/api/games"))
            .Content.ReadAsStringAsync()).RootElement;
        var ids = gamesJson.EnumerateArray()
            .Select(g => g.GetProperty("id").GetGuid())
            .Take(7)
            .ToList();
        Assert.True(ids.Count >= 7);

        var fourSprint = await client.PostAsJsonAsync(
            "/api/runs/initialize",
            new { gameIds = ids.Take(4).ToList(), runType = "Sprint" });
        Assert.Equal(HttpStatusCode.BadRequest, fourSprint.StatusCode);

        var legacy = await client.PostAsJsonAsync(
            "/api/runs/initialize",
            new { gameIds = ids.Take(3).ToList(), runType = "Standard" });
        Assert.Equal(HttpStatusCode.BadRequest, legacy.StatusCode);

        var ok = await client.PostAsJsonAsync(
            "/api/runs/initialize",
            new { gameIds = ids.Take(3).ToList(), runType = "Sprint" });
        ok.EnsureSuccessStatusCode();
    }
}
