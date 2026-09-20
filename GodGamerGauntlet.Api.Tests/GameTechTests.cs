using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

public class GameTechTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly CourtApiFactory _factory;

    public GameTechTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username);

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

    private async Task<Guid> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var game = new Game
        {
            Id = Guid.NewGuid(),
            Title = $"Techquest {Guid.NewGuid():N}"[..24],
            BaseDifficulty = 50,
            IsFeatured = true,
        };
        db.Games.Add(game);
        await db.SaveChangesAsync();
        return game.Id;
    }

    [Fact]
    public async Task List_returns_404_for_unknown_game()
    {
        var response = await _factory.CreateClient()
            .GetAsync($"/api/games/{Guid.NewGuid()}/tech");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task List_is_empty_when_nothing_is_published()
    {
        var gameId = await SeedGameAsync();
        var response = await _factory.CreateClient().GetAsync($"/api/games/{gameId}/tech");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(JsonValueKind.Array, body.ValueKind);
        Assert.Equal(0, body.GetArrayLength());
    }

    [Fact]
    public async Task Seed_publishes_roster_tricks_on_celeste_and_hides_drafts()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await DbInitializer.SeedAsync(db);
            var celeste = await db.Games.SingleAsync(g => g.Title == "Celeste");
            db.GameTeches.Add(new GameTech
            {
                Id = Guid.NewGuid(),
                GameId = celeste.Id,
                Slug = $"draft-{Guid.NewGuid():N}"[..20],
                Title = "Unpublished scratch",
                Summary = "Should never appear on GET.",
                Kind = GameTechKind.Glitch,
                Difficulty = GameTechDifficulty.Easy,
                PatchScope = GameTechPatchScope.All,
                Status = GameTechStatus.Draft,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        Guid celesteId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            celesteId = (await db.Games.SingleAsync(g => g.Title == "Celeste")).Id;
        }

        var response = await _factory.CreateClient().GetAsync($"/api/games/{celesteId}/tech");
        response.EnsureSuccessStatusCode();
        var items = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray().ToList();
        var slugs = items.Select(t => t.GetProperty("slug").GetString()).ToHashSet();
        Assert.Contains("wavedash", slugs);
        Assert.DoesNotContain(slugs, s => s is not null && s.StartsWith("draft-", StringComparison.Ordinal));
        var wavedash = items.Single(t => t.GetProperty("slug").GetString() == "wavedash");
        Assert.Equal("Movement", wavedash.GetProperty("kind").GetString());
        Assert.True(wavedash.GetProperty("clips").GetArrayLength() >= 1);
    }

    [Fact]
    public async Task Vote_requires_auth_and_records_myVote()
    {
        Guid gameId;
        Guid techId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var game = new Game
            {
                Id = Guid.NewGuid(),
                Title = $"Techvote {Guid.NewGuid():N}"[..24],
                BaseDifficulty = 40,
                IsFeatured = true,
            };
            var tech = new GameTech
            {
                Id = Guid.NewGuid(),
                GameId = game.Id,
                Slug = "short-hop",
                Title = "Short hop",
                Summary = "Jump cancel into a dash.",
                Kind = GameTechKind.Movement,
                Difficulty = GameTechDifficulty.Easy,
                PatchScope = GameTechPatchScope.All,
                Status = GameTechStatus.Published,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.AddRange(game, tech);
            await db.SaveChangesAsync();
            gameId = game.Id;
            techId = tech.Id;
        }

        var anon = await _factory.CreateClient()
            .PutAsJsonAsync($"/api/games/{gameId}/tech/{techId}/vote", new { value = 1 });
        Assert.Equal(HttpStatusCode.Unauthorized, anon.StatusCode);

        var (client, _) = await RegisterAsync("techvt");
        var voted = await client.PutAsJsonAsync(
            $"/api/games/{gameId}/tech/{techId}/vote", new { value = 1 });
        voted.EnsureSuccessStatusCode();
        var voteBody = JsonDocument.Parse(await voted.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, voteBody.GetProperty("voteScore").GetInt32());
        Assert.Equal(1, voteBody.GetProperty("myVote").GetInt32());

        var listed = JsonDocument.Parse(await (await client.GetAsync($"/api/games/{gameId}/tech"))
            .Content.ReadAsStringAsync()).RootElement;
        var card = listed.EnumerateArray().Single();
        Assert.Equal(1, card.GetProperty("score").GetInt32());
        Assert.Equal(1, card.GetProperty("myVote").GetInt32());
    }

    [Fact]
    public async Task Report_accepts_patched_from_a_signed_in_runner()
    {
        Guid gameId;
        Guid techId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var game = new Game
            {
                Id = Guid.NewGuid(),
                Title = $"Techrep {Guid.NewGuid():N}"[..24],
                BaseDifficulty = 40,
                IsFeatured = true,
            };
            var tech = new GameTech
            {
                Id = Guid.NewGuid(),
                GameId = game.Id,
                Slug = "old-skip",
                Title = "Old skip",
                Summary = "May be patched.",
                Kind = GameTechKind.Skip,
                Difficulty = GameTechDifficulty.Medium,
                PatchScope = GameTechPatchScope.All,
                Status = GameTechStatus.Published,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.AddRange(game, tech);
            await db.SaveChangesAsync();
            gameId = game.Id;
            techId = tech.Id;
        }

        var (client, userId) = await RegisterAsync("techrp");
        var reported = await client.PostAsJsonAsync(
            $"/api/games/{gameId}/tech/{techId}/reports",
            new { kind = "Patched", note = "Gone after 1.1." });
        reported.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await reported.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("Patched", body.GetProperty("kind").GetString());
        Assert.Equal("Pending", body.GetProperty("status").GetString());

        using var verify = _factory.Services.CreateScope();
        var stored = verify.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await stored.GameTechReports.SingleAsync(r => r.TechId == techId);
        Assert.Equal(userId, row.UserId);
        Assert.Equal(GameTechReportKind.Patched, row.Kind);
        Assert.Equal("Gone after 1.1.", row.Note);
    }
}
