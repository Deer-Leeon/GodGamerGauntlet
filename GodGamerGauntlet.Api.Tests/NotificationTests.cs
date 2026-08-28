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
/// Phase 7: the feedback loop. Verdicts and WR snipes must land in the right
/// player's inbox — and nobody else's.
/// </summary>
public class NotificationTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public NotificationTests(CourtApiFactory factory) => _factory = factory;

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
        var game = new Game { Id = Guid.NewGuid(), Title = $"Bellquest {Guid.NewGuid():N}", BaseDifficulty = 50 };
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

    private static async Task<Guid> SubmitAsync(HttpClient runner, Guid gameId, Guid categoryId, long timeMs)
    {
        var response = await runner.PostAsJsonAsync("/api/submissions", new
        {
            gameId,
            categoryId,
            primaryTimeMs = timeMs,
            videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            playedOn = DateTimeOffset.UtcNow.AddDays(-1),
            isEmulator = false,
            variableValueIds = Array.Empty<Guid>(),
        });
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return body.GetProperty("id").GetGuid();
    }

    private static async Task ReviewAsync(HttpClient admin, Guid submissionId, object body)
    {
        var response = await admin.PostAsJsonAsync($"/api/submissions/{submissionId}/review", body);
        response.EnsureSuccessStatusCode();
    }

    private static async Task<JsonElement[]> InboxAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/notifications");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        return [.. body.EnumerateArray()];
    }

    [Fact]
    public async Task Verdicts_notify_the_runner_and_read_state_is_private()
    {
        var (runner, _, runnerName) = await RegisterAsync("bell");
        var (admin, adminId, _) = await RegisterAsync("judge");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId) = await SeedBoardAsync();

        var rejectedId = await SubmitAsync(runner, gameId, categoryId, 70_000);
        await ReviewAsync(admin, rejectedId, new { action = "Reject", rejectReason = "Timer not visible." });

        var verifiedId = await SubmitAsync(runner, gameId, categoryId, 60_000);
        await ReviewAsync(admin, verifiedId, new { action = "Verify" });

        // Newest first: the verification, then the rejection.
        var inbox = await InboxAsync(runner);
        Assert.Equal(2, inbox.Length);

        var verified = inbox[0];
        Assert.Contains("was verified", verified.GetProperty("message").GetString());
        Assert.Equal($"/records/{gameId}", verified.GetProperty("actionUrl").GetString());
        Assert.False(verified.GetProperty("isRead").GetBoolean());

        var rejected = inbox[1];
        Assert.Contains("was rejected", rejected.GetProperty("message").GetString());
        Assert.Contains("Timer not visible.", rejected.GetProperty("message").GetString());
        Assert.Contains($"/u/{runnerName}", rejected.GetProperty("actionUrl").GetString());
        Assert.Contains("tab=pending", rejected.GetProperty("actionUrl").GetString());

        // Mark the verification read; only that one flips.
        var readResponse = await runner.PutAsync(
            $"/api/notifications/{verified.GetProperty("id").GetGuid()}/read", null);
        Assert.Equal(HttpStatusCode.NoContent, readResponse.StatusCode);
        var after = await InboxAsync(runner);
        Assert.True(after[0].GetProperty("isRead").GetBoolean());
        Assert.False(after[1].GetProperty("isRead").GetBoolean());

        // Privacy: anonymous callers bounce; another user can't read or mark ours.
        var anonymous = _factory.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.GetAsync("/api/notifications")).StatusCode);

        var (bystander, _, _) = await RegisterAsync("nosy");
        Assert.Empty(await InboxAsync(bystander));
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await bystander.PutAsync(
                $"/api/notifications/{rejected.GetProperty("id").GetGuid()}/read", null)).StatusCode);
    }

    [Fact]
    public async Task Snipes_notify_the_dethroned_record_holder_only()
    {
        var (holder, _, _) = await RegisterAsync("champ");
        var (sniper, _, sniperName) = await RegisterAsync("sniper");
        var (admin, adminId, _) = await RegisterAsync("judge");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId) = await SeedBoardAsync();

        // Champ sets the record, sniper beats it.
        await ReviewAsync(admin, await SubmitAsync(holder, gameId, categoryId, 60_000), new { action = "Verify" });
        await ReviewAsync(admin, await SubmitAsync(sniper, gameId, categoryId, 50_000), new { action = "Verify" });

        var holderInbox = await InboxAsync(holder);
        var snipe = holderInbox.Single(n =>
            n.GetProperty("message").GetString()!.Contains("was beaten by"));
        Assert.Contains(sniperName, snipe.GetProperty("message").GetString());
        Assert.Equal($"/records/{gameId}", snipe.GetProperty("actionUrl").GetString());

        // The sniper improving their own record must not self-snipe.
        await ReviewAsync(admin, await SubmitAsync(sniper, gameId, categoryId, 45_000), new { action = "Verify" });
        var sniperInbox = await InboxAsync(sniper);
        Assert.DoesNotContain(sniperInbox, n =>
            n.GetProperty("message").GetString()!.Contains("was beaten by"));
        // Two verifications, zero snipes.
        Assert.Equal(2, sniperInbox.Count(n =>
            n.GetProperty("message").GetString()!.Contains("was verified")));

        // A slower verified run must not snipe anyone either.
        var (slowpoke, _, _) = await RegisterAsync("slow");
        await ReviewAsync(admin, await SubmitAsync(slowpoke, gameId, categoryId, 90_000), new { action = "Verify" });
        var sniperAfter = await InboxAsync(sniper);
        Assert.DoesNotContain(sniperAfter, n =>
            n.GetProperty("message").GetString()!.Contains("was beaten by"));
    }
}
