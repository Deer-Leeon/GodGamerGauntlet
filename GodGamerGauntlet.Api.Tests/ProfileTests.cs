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
/// Phase 6: the trophy room. The public speedrun shelf only ever exposes
/// current verified PBs; pending/rejected runs stay private to their owner.
/// </summary>
public class ProfileTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public ProfileTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username);

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

    private async Task PromoteToAdminAsync(Guid userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FindAsync(userId);
        user!.IsAdmin = true;
        await db.SaveChangesAsync();
    }

    private async Task<(Guid GameId, Guid CategoryId)> SeedBoardAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var game = new Game { Id = Guid.NewGuid(), Title = $"Trophyquest {Guid.NewGuid():N}", BaseDifficulty = 50 };
        var category = new Category
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            Name = "Any%",
            CreatedAt = DateTime.UtcNow,
        };
        db.AddRange(game, category);
        await db.SaveChangesAsync();
        return (game.Id, category.Id);
    }

    private static object SubmitBody(Guid gameId, Guid categoryId, long timeMs) => new
    {
        gameId,
        categoryId,
        primaryTimeMs = timeMs,
        videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        playedOn = DateTimeOffset.UtcNow.AddDays(-1),
        isEmulator = false,
        variableValueIds = Array.Empty<Guid>(),
    };

    private static async Task<Guid> SubmitAsync(HttpClient runner, Guid gameId, Guid categoryId, long timeMs)
    {
        var response = await runner.PostAsJsonAsync(
            "/api/submissions", SubmitBody(gameId, categoryId, timeMs));
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return body.GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
    }

    [Fact]
    public async Task Public_shelf_shows_only_current_verified_pbs()
    {
        var (runner, _, runnerName) = await RegisterAsync("shelf");
        var (admin, adminId, _) = await RegisterAsync("judge");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId) = await SeedBoardAsync();

        // Four runs: a 90s PB that a later 60s run obsoletes, one still
        // pending, and one rejected. Only the 60s run is a current PB.
        var slowId = await SubmitAsync(runner, gameId, categoryId, 90_000);
        (await admin.PostAsJsonAsync(
            $"/api/submissions/{slowId}/review", new { action = "Verify" })).EnsureSuccessStatusCode();

        var fastId = await SubmitAsync(runner, gameId, categoryId, 60_000);
        (await admin.PostAsJsonAsync(
            $"/api/submissions/{fastId}/review", new { action = "Verify" })).EnsureSuccessStatusCode();

        await SubmitAsync(runner, gameId, categoryId, 55_000); // stays pending

        var rejectedId = await SubmitAsync(runner, gameId, categoryId, 50_000);
        (await admin.PostAsJsonAsync(
            $"/api/submissions/{rejectedId}/review",
            new { action = "Reject", rejectReason = "Splice at 0:42." })).EnsureSuccessStatusCode();

        // Anonymous visitors see exactly one PB: the verified, non-obsolete run.
        var anonymous = _factory.CreateClient();
        var shelf = await ReadJsonAsync(await anonymous.GetAsync(
            $"/api/users/by-username/{runnerName}/speedruns"));

        var pb = Assert.Single(shelf.EnumerateArray());
        Assert.Equal(fastId, pb.GetProperty("id").GetGuid());
        Assert.Equal(60_000, pb.GetProperty("primaryTimeMs").GetInt64());
        Assert.Equal("Verified", pb.GetProperty("status").GetString());

        // Unknown players 404 rather than returning an empty shelf.
        var missing = await anonymous.GetAsync("/api/users/by-username/no-such-player/speedruns");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Pending_runs_are_private_to_their_owner()
    {
        var (runner, _, _) = await RegisterAsync("court");
        var (admin, adminId, _) = await RegisterAsync("judge");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId) = await SeedBoardAsync();

        var pendingId = await SubmitAsync(runner, gameId, categoryId, 70_000);
        var rejectedId = await SubmitAsync(runner, gameId, categoryId, 65_000);
        (await admin.PostAsJsonAsync(
            $"/api/submissions/{rejectedId}/review",
            new { action = "Reject", rejectReason = "No timer visible." })).EnsureSuccessStatusCode();

        // Anonymous callers are turned away outright.
        var anonymous = _factory.CreateClient();
        var unauthorized = await anonymous.GetAsync("/api/users/me/pending-runs");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        // The owner sees both runs, with the examiner's reason on the rejection.
        var mine = await ReadJsonAsync(await runner.GetAsync("/api/users/me/pending-runs"));
        var byId = mine.EnumerateArray().ToDictionary(x => x.GetProperty("id").GetGuid());
        Assert.Equal(2, byId.Count);
        Assert.Equal("Pending", byId[pendingId].GetProperty("status").GetString());
        Assert.Equal("Rejected", byId[rejectedId].GetProperty("status").GetString());
        Assert.Equal("No timer visible.", byId[rejectedId].GetProperty("rejectReason").GetString());

        // An unrelated user gets their own (empty) courtroom, not the runner's.
        var (bystander, _, _) = await RegisterAsync("bystander");
        var theirs = await ReadJsonAsync(await bystander.GetAsync("/api/users/me/pending-runs"));
        Assert.Empty(theirs.EnumerateArray());
    }
}
