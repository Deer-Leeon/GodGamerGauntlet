using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>
/// Overlay toggle/split persist on the ledger. The desktop timer and the
/// web overlay both POST these routes; the clock itself ticks locally.
/// </summary>
public class OverlayTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public OverlayTests(CourtApiFactory factory) => _factory = factory;

    private sealed record AuthResponse(string Token, AuthUser User);
    private sealed record AuthUser(Guid Id, string Username);

    [Fact]
    public async Task Sprint_toggle_and_split_round_trip_with_jwt_and_overlay_key()
    {
        var client = _factory.CreateClient();
        var username = $"ovl_{Guid.NewGuid():N}"[..20];
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
            .Take(3)
            .ToList();
        Assert.Equal(3, ids.Count);

        var init = await client.PostAsJsonAsync(
            "/api/runs/initialize",
            new { gameIds = ids, runType = "Sprint" });
        init.EnsureSuccessStatusCode();
        var run = JsonDocument.Parse(await init.Content.ReadAsStringAsync()).RootElement;
        var runId = run.GetProperty("id").GetGuid();
        Assert.Equal("idle", run.GetProperty("timerStatus").GetString());

        var overlayGet = await client.GetAsync($"/api/runs/{runId}/overlay");
        overlayGet.EnsureSuccessStatusCode();
        var overlay = JsonDocument.Parse(await overlayGet.Content.ReadAsStringAsync()).RootElement;
        var overlayKey = overlay.GetProperty("overlayKey").GetString();
        Assert.False(string.IsNullOrWhiteSpace(overlayKey));
        Assert.Equal("idle", overlay.GetProperty("timerStatus").GetString());
        Assert.Equal(0, overlay.GetProperty("elapsedMs").GetInt64());

        var toggle = await client.PostAsync($"/api/runs/{runId}/overlay/toggle", null);
        toggle.EnsureSuccessStatusCode();
        var running = JsonDocument.Parse(await toggle.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("running", running.GetProperty("timerStatus").GetString());

        var persisted = JsonDocument.Parse(await (await client.GetAsync($"/api/runs/{runId}/overlay"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("running", persisted.GetProperty("timerStatus").GetString());

        var split = await client.PostAsync($"/api/runs/{runId}/overlay/split", null);
        split.EnsureSuccessStatusCode();
        var afterSplit = JsonDocument.Parse(await split.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(1, afterSplit.GetProperty("currentSlotIndex").GetInt32());
        var firstGame = afterSplit.GetProperty("games")[0];
        Assert.True(firstGame.GetProperty("completed").GetBoolean());
        Assert.Equal("Won", firstGame.GetProperty("status").GetString());
        Assert.True(firstGame.GetProperty("splitTimeMs").GetInt64() >= 0);

        var keyClient = _factory.CreateClient();
        var keyToggle = await keyClient.PostAsync(
            $"/api/runs/{runId}/overlay/toggle?key={Uri.EscapeDataString(overlayKey!)}",
            null);
        keyToggle.EnsureSuccessStatusCode();
        var paused = JsonDocument.Parse(await keyToggle.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("paused", paused.GetProperty("timerStatus").GetString());

        var resume = await client.PostAsync($"/api/runs/{runId}/overlay/toggle", null);
        resume.EnsureSuccessStatusCode();
        var freeze = await client.PostAsync($"/api/runs/{runId}/overlay/toggle?elapsedMs=1234", null);
        freeze.EnsureSuccessStatusCode();
        var frozen = JsonDocument.Parse(await freeze.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("paused", frozen.GetProperty("timerStatus").GetString());
        Assert.Equal(1234, frozen.GetProperty("elapsedMs").GetInt64());

        var frozenGet = JsonDocument.Parse(await (await client.GetAsync($"/api/runs/{runId}/overlay"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("paused", frozenGet.GetProperty("timerStatus").GetString());
        Assert.Equal(1234, frozenGet.GetProperty("elapsedMs").GetInt64());

        var stranger = await _factory.CreateClient()
            .PostAsync($"/api/runs/{runId}/overlay/toggle", null);
        Assert.Equal(HttpStatusCode.Forbidden, stranger.StatusCode);
    }
}
