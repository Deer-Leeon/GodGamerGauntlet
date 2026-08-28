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
/// Phase 8: streamer identity (avatar) and the public "Live Now" directory of
/// gauntlets with a running timer.
/// </summary>
public class LiveDirectoryTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public LiveDirectoryTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username, string? AvatarUrl);

    private async Task<(HttpClient Client, Guid UserId, string Username)> RegisterAsync(string prefix)
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
        return (client, auth.User.Id, auth.User.Username);
    }

    [Fact]
    public async Task Avatar_updates_are_validated_and_round_trip()
    {
        var (client, _, _) = await RegisterAsync("avatar");

        // Anonymous callers bounce.
        var anonymous = _factory.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.PutAsJsonAsync("/api/users/me/profile", new { avatarUrl = "https://x.test/a.png" })).StatusCode);

        // Non-http(s) schemes and garbage are rejected — this URL becomes an <img src>.
        foreach (var bad in new[] { "notaurl", "javascript:alert(1)", "ftp://x.test/a.png" })
        {
            var rejected = await client.PutAsJsonAsync("/api/users/me/profile", new { avatarUrl = bad });
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }

        // A valid https URL saves and comes back on the auth payload and /me.
        var saved = await client.PutAsJsonAsync(
            "/api/users/me/profile", new { avatarUrl = " https://cdn.test/me.png " });
        saved.EnsureSuccessStatusCode();
        var auth = await saved.Content.ReadFromJsonAsync<AuthResponse>(Json);
        Assert.Equal("https://cdn.test/me.png", auth!.User.AvatarUrl);

        var me = JsonDocument.Parse(
            await (await client.GetAsync("/api/auth/me")).Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("https://cdn.test/me.png", me.GetProperty("avatarUrl").GetString());

        // Blank clears it.
        var cleared = await client.PutAsJsonAsync("/api/users/me/profile", new { avatarUrl = "" });
        cleared.EnsureSuccessStatusCode();
        var clearedAuth = await cleared.Content.ReadFromJsonAsync<AuthResponse>(Json);
        Assert.Null(clearedAuth!.User.AvatarUrl);
    }

    [Fact]
    public async Task Live_directory_lists_running_timers_newest_first_with_stream_identity()
    {
        var (_, streamerId, streamerName) = await RegisterAsync("live");
        var (_, idlerId, _) = await RegisterAsync("idle");

        Guid liveRunId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var streamer = await db.Users.FindAsync(streamerId);
            streamer!.AvatarUrl = "https://cdn.test/streamer.png";
            db.UserStreamLinks.Add(new UserStreamLink
            {
                Id = Guid.NewGuid(),
                UserId = streamerId,
                Platform = "twitch",
                Url = "https://twitch.tv/streamer",
                SortOrder = 0,
            });

            var beaten = new Game { Id = Guid.NewGuid(), Title = "Beaten Game", BaseDifficulty = 40 };
            var playing = new Game
            {
                Id = Guid.NewGuid(),
                Title = "Now Playing Game",
                Thumb = "https://cdn.test/playing.jpg",
                BaseDifficulty = 60,
            };
            db.AddRange(beaten, playing);

            Run MakeRun(Guid userId, RunStatus status, string timerStatus, DateTime updatedAt, long elapsed) =>
                new()
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    StartTime = DateTime.UtcNow.AddHours(-1),
                    Status = status,
                    RunType = RunType.Lite,
                    TimerStatus = timerStatus,
                    TimerElapsedMs = elapsed,
                    TimerUpdatedAt = updatedAt,
                };

            // The headline card: running just now, one slot beaten.
            var liveRun = MakeRun(streamerId, RunStatus.Active, "running", DateTime.UtcNow, 90_000);
            liveRun.Slots.Add(new RunSlot
            {
                Id = Guid.NewGuid(), GameId = beaten.Id, Position = 1, Status = RunSlotStatus.Won,
            });
            liveRun.Slots.Add(new RunSlot
            {
                Id = Guid.NewGuid(), GameId = playing.Id, Position = 2, Status = RunSlotStatus.Pending,
            });
            liveRunId = liveRun.Id;

            // Running, but stale — must sort after the fresh one.
            var older = MakeRun(idlerId, RunStatus.Active, "running", DateTime.UtcNow.AddMinutes(-30), 40_000);

            // Paused and finished runs never make the rail.
            var paused = MakeRun(idlerId, RunStatus.Active, "paused", DateTime.UtcNow, 10_000);
            var finished = MakeRun(idlerId, RunStatus.Completed, "finished", DateTime.UtcNow, 99_000);

            db.AddRange(liveRun, older, paused, finished);
            await db.SaveChangesAsync();
        }

        var anonymous = _factory.CreateClient();
        var response = await anonymous.GetAsync("/api/runs/live");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        // The factory database is shared across suites; scope to our two runs.
        var cards = body.EnumerateArray()
            .Where(c => c.GetProperty("username").GetString()!.StartsWith("live_")
                || c.GetProperty("username").GetString()!.StartsWith("idle_"))
            .ToArray();

        Assert.Equal(2, cards.Length);

        var headline = cards[0];
        Assert.Equal(liveRunId, headline.GetProperty("runId").GetGuid());
        Assert.Equal(streamerName, headline.GetProperty("username").GetString());
        Assert.Equal("https://cdn.test/streamer.png", headline.GetProperty("avatarUrl").GetString());
        Assert.Equal("https://twitch.tv/streamer", headline.GetProperty("streamUrl").GetString());
        Assert.Equal("Now Playing Game", headline.GetProperty("currentTitle").GetString());
        Assert.Equal("https://cdn.test/playing.jpg", headline.GetProperty("currentThumb").GetString());
        Assert.Equal(1, headline.GetProperty("slotsCompleted").GetInt32());
        Assert.Equal(5, headline.GetProperty("totalSlots").GetInt32());
        // Extrapolated from TimerUpdatedAt, so at least the stored elapsed.
        Assert.True(headline.GetProperty("elapsedMs").GetInt64() >= 90_000);

        // The stale runner has no links or avatar; nulls, not crashes.
        var second = cards[1];
        Assert.Equal(JsonValueKind.Null, second.GetProperty("streamUrl").ValueKind);
        Assert.Equal(JsonValueKind.Null, second.GetProperty("avatarUrl").ValueKind);
    }
}
