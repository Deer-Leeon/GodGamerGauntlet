using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>Phase 5: the paginated catalog behind the /records directory.</summary>
public class CatalogTests : IClassFixture<CourtApiFactory>
{
    private readonly CourtApiFactory _factory;

    public CatalogTests(CourtApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Catalog_lists_roster_games_only_and_paginates()
    {
        // Unique prefix: the factory database is shared with the other suites.
        var prefix = $"Catseek{Guid.NewGuid():N}"[..16];

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            for (var i = 0; i < 5; i++)
            {
                db.Games.Add(new Game
                {
                    Id = Guid.NewGuid(),
                    Title = $"{prefix} Quest {i}",
                    BaseDifficulty = 50,
                    IsFeatured = true,
                    PopularityRank = 100 - i * 10,
                });
            }

            // Retired: matches the search but is off the roster, so it must
            // never reach the directory.
            db.Games.Add(new Game
            {
                Id = Guid.NewGuid(),
                Title = $"{prefix} Quest Retired",
                BaseDifficulty = 50,
                IsFeatured = false,
                PopularityRank = 1,
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();

        // Page 1 of 2: roster order is ascending popularity rank.
        var response = await client.GetAsync(
            $"/api/catalog?search={prefix}&page=1&pageSize=3");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        // Six rows match the prefix; the retired one is filtered out.
        Assert.Equal(5, body.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, body.GetProperty("totalPages").GetInt32());
        Assert.Equal(1, body.GetProperty("currentPage").GetInt32());

        var titles = body.GetProperty("items").EnumerateArray()
            .Select(g => g.GetProperty("title").GetString()).ToArray();
        // Ranks are 100/90/80/70/60 for games 0-4, so the best ranks lead.
        Assert.Equal(
            [$"{prefix} Quest 4", $"{prefix} Quest 3", $"{prefix} Quest 2"],
            titles);

        // Page 2 has the remainder.
        var page2 = JsonDocument.Parse(await (await client.GetAsync(
                $"/api/catalog?search={prefix}&page=2&pageSize=3"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(2, page2.GetProperty("items").GetArrayLength());
        Assert.Equal(2, page2.GetProperty("currentPage").GetInt32());

        // Case-insensitive search + out-of-range page clamps.
        var upper = JsonDocument.Parse(await (await client.GetAsync(
                $"/api/catalog?search={prefix.ToUpperInvariant()}&page=99&pageSize=3"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(5, upper.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, upper.GetProperty("currentPage").GetInt32());

        // No matches: empty page 1 of 1, no error.
        var none = JsonDocument.Parse(await (await client.GetAsync(
                "/api/catalog?search=zzz-no-such-game-zzz"))
            .Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(0, none.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, none.GetProperty("totalPages").GetInt32());
        Assert.Equal(0, none.GetProperty("items").GetArrayLength());
    }

    /// <summary>
    /// The Draft Room list and the speedrun.com board list are the same games —
    /// that equality is what the licence request to Elo describes.
    /// </summary>
    [Fact]
    public async Task Draft_catalog_is_exactly_the_gauntlet_roster()
    {
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await DbInitializer.SeedAsync(db);
        }

        var response = await _factory.CreateClient().GetAsync("/api/games");
        response.EnsureSuccessStatusCode();
        var titles = JsonDocument.Parse(await response.Content.ReadAsStringAsync())
            .RootElement.EnumerateArray()
            .Select(g => g.GetProperty("title").GetString()!)
            .ToList();

        Assert.Equal(
            GauntletRoster.Games.Select(g => g.Title).ToList(),
            titles);
        Assert.Equal(
            GauntletRoster.Games.Select(g => g.Title).OrderBy(t => t).ToList(),
            SrcFlagshipMap.Games.Select(g => g.Title).OrderBy(t => t).ToList());
    }
}
