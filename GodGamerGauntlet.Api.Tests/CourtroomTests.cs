using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

public class CourtroomTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public CourtroomTests(CourtApiFactory factory) => _factory = factory;

    // ── Plumbing ─────────────────────────────────────────────────────────────

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

    private async Task PromoteToAdminAsync(Guid userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = await db.Users.FindAsync(userId);
        user!.IsAdmin = true;
        await db.SaveChangesAsync();
    }

    /// <summary>Seeds a game + "Any%" category with a required subcategory variable "Platform" (PC, N64).</summary>
    private async Task<(Guid GameId, Guid CategoryId, Guid PcValueId, Guid N64ValueId)> SeedBoardAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var game = new Game { Id = Guid.NewGuid(), Title = $"Testquest {Guid.NewGuid():N}", BaseDifficulty = 50 };
        var category = new Category
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            Name = "Any%",
            Rules = "Reach the credits.",
            CreatedAt = DateTime.UtcNow,
        };
        var platform = new Variable
        {
            Id = Guid.NewGuid(),
            CategoryId = category.Id,
            Name = "Platform",
            IsSubcategory = true,
            IsRequired = true,
        };
        var pc = new VariableValue { Id = Guid.NewGuid(), VariableId = platform.Id, Value = "PC" };
        var n64 = new VariableValue { Id = Guid.NewGuid(), VariableId = platform.Id, Value = "Nintendo 64" };

        db.AddRange(game, category, platform, pc, n64);
        await db.SaveChangesAsync();
        return (game.Id, category.Id, pc.Id, n64.Id);
    }

    private static object SubmitBody(
        Guid gameId, Guid categoryId, long timeMs, Guid[] valueIds,
        string videoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ") => new
        {
            gameId,
            categoryId,
            primaryTimeMs = timeMs,
            videoUrl,
            playedOn = DateTimeOffset.UtcNow.AddDays(-1),
            isEmulator = false,
            variableValueIds = valueIds,
        };

    private static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        return JsonDocument.Parse(text).RootElement;
    }

    // ── Submission validation ────────────────────────────────────────────────

    [Fact]
    public async Task Submit_rejects_non_video_proof_links()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();

        var response = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 60_000, [pcId], videoUrl: "https://example.com/notavod"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Submit_rejects_missing_required_variable()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (gameId, categoryId, _, _) = await SeedBoardAsync();

        var response = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 60_000, []));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Platform", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Submit_requires_authentication()
    {
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();
        var anonymous = _factory.CreateClient();

        var response = await anonymous.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 60_000, [pcId]));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Submit_lands_pending_and_is_publicly_readable()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();

        var created = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 61_500, [pcId]));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var body = await ReadJsonAsync(created);
        var id = body.GetProperty("id").GetGuid();
        Assert.Equal("Pending", body.GetProperty("status").GetString());
        Assert.False(body.GetProperty("isObsolete").GetBoolean());

        var anonymous = _factory.CreateClient();
        var detail = await anonymous.GetAsync($"/api/submissions/{id}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        var detailBody = await ReadJsonAsync(detail);
        Assert.Equal("Any%", detailBody.GetProperty("categoryName").GetString());
        Assert.Equal("PC",
            detailBody.GetProperty("variables")[0].GetProperty("value").GetString());
    }

    // ── Authorization ────────────────────────────────────────────────────────

    [Fact]
    public async Task Random_user_cannot_review_and_sees_empty_queue()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (bystander, _) = await RegisterAsync("bystander");
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();

        var created = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 62_000, [pcId]));
        var id = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();

        var review = await bystander.PostAsJsonAsync(
            $"/api/submissions/{id}/review", new { action = "Verify" });
        Assert.Equal(HttpStatusCode.Forbidden, review.StatusCode);

        var queue = await ReadJsonAsync(await bystander.GetAsync("/api/moderation/queue"));
        Assert.Empty(queue.EnumerateArray());
    }

    [Fact]
    public async Task Only_admins_assign_moderators_and_mods_see_their_queue()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (mod, modId) = await RegisterAsync("mod");
        var (admin, adminId) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();

        // Non-admin cannot hand out robes.
        var denied = await mod.PostAsJsonAsync(
            $"/api/moderation/games/{gameId}/moderators", new { username = "whoever" });
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        // Admin assigns the mod by username.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var modUsername = (await db.Users.FindAsync(modId))!.Username;
        var assigned = await admin.PostAsJsonAsync(
            $"/api/moderation/games/{gameId}/moderators", new { username = modUsername });
        Assert.Equal(HttpStatusCode.NoContent, assigned.StatusCode);

        var created = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 63_000, [pcId]));
        var id = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();

        var queue = await ReadJsonAsync(await mod.GetAsync("/api/moderation/queue"));
        Assert.Contains(queue.EnumerateArray(),
            item => item.GetProperty("submissionId").GetGuid() == id);
    }

    // ── Verdicts and the obsolete flag ───────────────────────────────────────

    [Fact]
    public async Task Reject_requires_reason_and_records_the_examiner()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (admin, adminId) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId, pcId, _) = await SeedBoardAsync();

        var created = await runner.PostAsJsonAsync("/api/submissions",
            SubmitBody(gameId, categoryId, 64_000, [pcId]));
        var id = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();

        var missingReason = await admin.PostAsJsonAsync(
            $"/api/submissions/{id}/review", new { action = "Reject" });
        Assert.Equal(HttpStatusCode.BadRequest, missingReason.StatusCode);

        var rejected = await admin.PostAsJsonAsync(
            $"/api/submissions/{id}/review",
            new { action = "Reject", rejectReason = "Video cuts out at the final split." });
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);

        var body = await ReadJsonAsync(rejected);
        Assert.Equal("Rejected", body.GetProperty("status").GetString());
        Assert.Equal("Video cuts out at the final split.",
            body.GetProperty("rejectReason").GetString());
        Assert.False(string.IsNullOrEmpty(body.GetProperty("examinerName").GetString()));
        Assert.NotEqual(JsonValueKind.Null, body.GetProperty("reviewedAt").ValueKind);

        // Double jeopardy: a decided run cannot be re-reviewed.
        var again = await admin.PostAsJsonAsync(
            $"/api/submissions/{id}/review", new { action = "Verify" });
        Assert.Equal(HttpStatusCode.BadRequest, again.StatusCode);
    }

    [Fact]
    public async Task Verifying_a_faster_run_obsoletes_the_old_pb_per_subcategory()
    {
        var (runner, _) = await RegisterAsync("runner");
        var (admin, adminId) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId, pcId, n64Id) = await SeedBoardAsync();

        async Task<Guid> SubmitAndVerifyAsync(long timeMs, Guid valueId)
        {
            var created = await runner.PostAsJsonAsync("/api/submissions",
                SubmitBody(gameId, categoryId, timeMs, [valueId]));
            var id = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();
            var verified = await admin.PostAsJsonAsync(
                $"/api/submissions/{id}/review", new { action = "Verify" });
            Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
            return id;
        }

        var slowPc = await SubmitAndVerifyAsync(100_000, pcId);
        var fastPc = await SubmitAndVerifyAsync(90_000, pcId);
        var n64Run = await SubmitAndVerifyAsync(120_000, n64Id);

        async Task<bool> IsObsoleteAsync(Guid id)
        {
            var detail = await ReadJsonAsync(await runner.GetAsync($"/api/submissions/{id}"));
            return detail.GetProperty("isObsolete").GetBoolean();
        }

        // The slower PC run is superseded; the N64 board is untouched.
        Assert.True(await IsObsoleteAsync(slowPc));
        Assert.False(await IsObsoleteAsync(fastPc));
        Assert.False(await IsObsoleteAsync(n64Run));

        // A slower run verified later is born obsolete — the PB stands.
        var lateSlowPc = await SubmitAndVerifyAsync(95_000, pcId);
        Assert.True(await IsObsoleteAsync(lateSlowPc));
        Assert.False(await IsObsoleteAsync(fastPc));
    }

    // ── The public ledger ────────────────────────────────────────────────────

    [Fact]
    public async Task Records_metadata_exposes_categories_variables_and_moderators()
    {
        var anonymous = _factory.CreateClient();
        var (admin, adminId) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (_, modId) = await RegisterAsync("boardmod");
        var (gameId, _, _, _) = await SeedBoardAsync();

        string modUsername;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            modUsername = (await db.Users.FindAsync(modId))!.Username;
        }

        await admin.PostAsJsonAsync(
            $"/api/moderation/games/{gameId}/moderators", new { username = modUsername });

        var response = await anonymous.GetAsync($"/api/games/{gameId}/records");
        var raw = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == HttpStatusCode.OK,
            $"Expected 200, got {(int)response.StatusCode}: {raw}");
        var body = JsonDocument.Parse(raw).RootElement;

        Assert.Equal(gameId, body.GetProperty("gameId").GetGuid());
        var category = body.GetProperty("categories").EnumerateArray().Single();
        Assert.Equal("Any%", category.GetProperty("name").GetString());
        Assert.Equal("Reach the credits.", category.GetProperty("rules").GetString());

        var variable = category.GetProperty("variables").EnumerateArray().Single();
        Assert.True(variable.GetProperty("isSubcategory").GetBoolean());
        Assert.Equal(2, variable.GetProperty("values").GetArrayLength());

        Assert.Contains(body.GetProperty("moderators").EnumerateArray(),
            m => m.GetProperty("username").GetString() == modUsername);
    }

    [Fact]
    public async Task Leaderboard_shows_only_current_verified_runs_and_filters_by_value()
    {
        var (runnerA, _) = await RegisterAsync("runnerA");
        var (runnerB, _) = await RegisterAsync("runnerB");
        var (admin, adminId) = await RegisterAsync("admin");
        await PromoteToAdminAsync(adminId);
        var (gameId, categoryId, pcId, n64Id) = await SeedBoardAsync();

        async Task SubmitAsync(HttpClient runner, long timeMs, Guid valueId, bool verify)
        {
            var created = await runner.PostAsJsonAsync("/api/submissions",
                SubmitBody(gameId, categoryId, timeMs, [valueId]));
            var id = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();
            if (verify)
            {
                var reviewed = await admin.PostAsJsonAsync(
                    $"/api/submissions/{id}/review", new { action = "Verify" });
                Assert.Equal(HttpStatusCode.OK, reviewed.StatusCode);
            }
        }

        await SubmitAsync(runnerA, 100_000, pcId, verify: true); // obsoleted below
        await SubmitAsync(runnerA, 90_000, pcId, verify: true);  // A's PC PB
        await SubmitAsync(runnerB, 95_000, pcId, verify: true);  // B's PC PB
        await SubmitAsync(runnerB, 80_000, n64Id, verify: true); // B's N64 PB
        await SubmitAsync(runnerA, 50_000, pcId, verify: false); // pending, hidden

        var anonymous = _factory.CreateClient();
        var boardUrl = $"/api/games/{gameId}/categories/{categoryId}/leaderboard";

        // Merged view: each player once, at their overall fastest.
        var merged = await ReadJsonAsync(await anonymous.GetAsync(boardUrl));
        var mergedTimes = merged.EnumerateArray()
            .Select(row => row.GetProperty("primaryTimeMs").GetInt64()).ToArray();
        Assert.Equal([80_000L, 90_000L], mergedTimes);
        Assert.Equal(1, merged.EnumerateArray().First().GetProperty("rank").GetInt32());

        // PC-only pill: B's N64 run drops out, both PC PBs rank.
        var pcBoard = await ReadJsonAsync(await anonymous.GetAsync($"{boardUrl}?values={pcId}"));
        var pcTimes = pcBoard.EnumerateArray()
            .Select(row => row.GetProperty("primaryTimeMs").GetInt64()).ToArray();
        Assert.Equal([90_000L, 95_000L], pcTimes);

        // Unknown category 404s.
        var missing = await anonymous.GetAsync(
            $"/api/games/{gameId}/categories/{Guid.NewGuid()}/leaderboard");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
}
