using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>Phase 5: the paginated catalog behind the /records directory.</summary>
public class CatalogTests : IClassFixture<CourtApiFactory>
{
    private readonly CourtApiFactory _factory;

    public CatalogTests(CourtApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Catalog_searches_paginates_and_keeps_featured_first()
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
                    // Game 3 is curated: featured outranks better popularity.
                    IsFeatured = i == 3,
                    PopularityRank = 100 - i * 10,
                });
            }
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();

        // Page 1 of 2: featured first, then ascending popularity rank.
        var response = await client.GetAsync(
            $"/api/catalog?search={prefix}&page=1&pageSize=3");
        response.EnsureSuccessStatusCode();
        var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

        Assert.Equal(5, body.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, body.GetProperty("totalPages").GetInt32());
        Assert.Equal(1, body.GetProperty("currentPage").GetInt32());

        var titles = body.GetProperty("items").EnumerateArray()
            .Select(g => g.GetProperty("title").GetString()).ToArray();
        // Ranks are 100/90/80/70/60 for games 0-4; featured game 3 jumps the
        // queue, then the best remaining ranks: game 4 (60), game 2 (80).
        Assert.Equal(
            [$"{prefix} Quest 3", $"{prefix} Quest 4", $"{prefix} Quest 2"],
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
}
