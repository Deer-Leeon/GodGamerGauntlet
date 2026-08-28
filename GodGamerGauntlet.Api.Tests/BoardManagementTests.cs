using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>Phase 4: category/variable/value management by admins and game moderators.</summary>
public class BoardManagementTests : IClassFixture<CourtApiFactory>
{
    private readonly CourtApiFactory _factory;

    public BoardManagementTests(CourtApiFactory factory) => _factory = factory;

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
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>(
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
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

    private async Task<Guid> SeedGameAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var game = new Game
        {
            Id = Guid.NewGuid(),
            Title = $"Boardgame {Guid.NewGuid():N}",
            BaseDifficulty = 50,
        };
        db.Games.Add(game);
        await db.SaveChangesAsync();
        return game.Id;
    }

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(text).RootElement;
    }

    [Fact]
    public async Task Only_admins_and_assigned_moderators_can_touch_the_rules_engine()
    {
        var (bystander, _, _) = await RegisterAsync("bystander");
        var gameId = await SeedGameAsync();

        var denied = await bystander.PostAsJsonAsync(
            $"/api/games/{gameId}/categories", new { name = "Any%", rules = (string?)null });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var anonymous = _factory.CreateClient();
        var unauthenticated = await anonymous.PostAsJsonAsync(
            $"/api/games/{gameId}/categories", new { name = "Any%", rules = (string?)null });
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);
    }

    [Fact]
    public async Task Moderator_builds_a_board_and_the_public_metadata_reflects_it()
    {
        var (admin, adminId, _) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (mod, _, modUsername) = await RegisterAsync("builder");
        var gameId = await SeedGameAsync();

        var assigned = await admin.PostAsJsonAsync(
            $"/api/moderation/games/{gameId}/moderators", new { username = modUsername });
        Assert.Equal(HttpStatusCode.NoContent, assigned.StatusCode);

        // Category with markdown rules.
        var created = await mod.PostAsJsonAsync(
            $"/api/games/{gameId}/categories",
            new { name = "Any%", rules = "## Timing\nStarts on file select." });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var categoryId = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();

        // Blank names are refused; duplicates conflict.
        var blank = await mod.PostAsJsonAsync(
            $"/api/games/{gameId}/categories", new { name = "   ", rules = (string?)null });
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        var duplicate = await mod.PostAsJsonAsync(
            $"/api/games/{gameId}/categories", new { name = "Any%", rules = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);

        // Subcategory variable + two values.
        var variableResponse = await mod.PostAsJsonAsync(
            $"/api/categories/{categoryId}/variables",
            new { name = "Platform", isSubcategory = true, isRequired = true });
        Assert.Equal(HttpStatusCode.Created, variableResponse.StatusCode);
        var variableId = (await ReadJsonAsync(variableResponse)).GetProperty("id").GetGuid();

        foreach (var option in new[] { "PC", "Switch" })
        {
            var valueResponse = await mod.PostAsJsonAsync(
                $"/api/variables/{variableId}/values", new { value = option });
            Assert.Equal(HttpStatusCode.Created, valueResponse.StatusCode);
        }
        var duplicateValue = await mod.PostAsJsonAsync(
            $"/api/variables/{variableId}/values", new { value = "PC" });
        Assert.Equal(HttpStatusCode.Conflict, duplicateValue.StatusCode);

        // The public records page sees the whole structure.
        var records = await ReadJsonAsync(
            await _factory.CreateClient().GetAsync($"/api/games/{gameId}/records"));
        var category = records.GetProperty("categories").EnumerateArray().Single();
        Assert.Equal("Any%", category.GetProperty("name").GetString());
        var variable = category.GetProperty("variables").EnumerateArray().Single();
        Assert.True(variable.GetProperty("isSubcategory").GetBoolean());
        Assert.True(variable.GetProperty("isRequired").GetBoolean());
        Assert.Equal(2, variable.GetProperty("values").GetArrayLength());
    }

    [Fact]
    public async Task Category_update_edits_rules_but_blocks_outsiders_and_name_collisions()
    {
        var (admin, adminId, _) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (outsider, _, _) = await RegisterAsync("outsider");
        var gameId = await SeedGameAsync();

        Task<HttpResponseMessage> CreateAsync(string name) =>
            admin.PostAsJsonAsync(
                $"/api/games/{gameId}/categories", new { name, rules = (string?)null });

        var categoryId = (await ReadJsonAsync(await CreateAsync("Any%")))
            .GetProperty("id").GetGuid();
        await CreateAsync("100%");

        var denied = await outsider.PutAsJsonAsync(
            $"/api/categories/{categoryId}", new { name = "Any%", rules = "hijacked" });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        var collision = await admin.PutAsJsonAsync(
            $"/api/categories/{categoryId}", new { name = "100%", rules = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, collision.StatusCode);

        var updated = await admin.PutAsJsonAsync(
            $"/api/categories/{categoryId}",
            new { name = "Any% (No Wrong Warp)", rules = "No wrong warps." });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var body = await ReadJsonAsync(updated);
        Assert.Equal("Any% (No Wrong Warp)", body.GetProperty("name").GetString());
        Assert.Equal("No wrong warps.", body.GetProperty("rules").GetString());
    }
}
