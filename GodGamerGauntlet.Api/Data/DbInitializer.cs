using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public static class DbInitializer
{
    /// <summary>
    /// Competitive staples that must head the draft catalog regardless of what
    /// RAWG's most-added ordering says. Titles match RAWG's naming so the sync
    /// merges into these rows (by case-insensitive title) instead of duplicating
    /// them; difficulties reflect how punishing each is to actually beat/rank up in.
    /// </summary>
    private static readonly (string Title, int BaseDifficulty)[] FeaturedGames =
    [
        ("Counter-Strike 2", 92),
        ("League of Legends", 90),
        ("Dota 2", 95),
        ("VALORANT", 88),
        ("Tekken 7", 85),
        ("Super Smash Bros. Melee", 93),
        ("Street Fighter 6", 84),
        ("Rocket League", 80),
        ("Overwatch 2", 78),
        ("Apex Legends", 82),
        ("Fortnite", 76),
        ("StarCraft II", 94)
    ];

    public static async Task InitializeAsync(AppDbContext context)
    {
        await context.Database.MigrateAsync();
        await SeedAsync(context);
    }

    /// <summary>
    /// Seeds the demo user and the curated featured games. Idempotent — the rest
    /// of the catalog comes from RAWG.
    /// </summary>
    public static async Task SeedAsync(AppDbContext context)
    {
        if (!await context.Users.AnyAsync())
        {
            context.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                Username = "GodGamerDemo",
                CreatedAt = DateTime.UtcNow
            });
            await context.SaveChangesAsync();
        }

        await SeedFeaturedGamesAsync(context);
    }

    /// <summary>
    /// Pins the curated staples at <c>IsFeatured = true</c> and
    /// <c>PopularityRank = 0</c>. Promotes the existing row when RAWG already
    /// ingested the title, so re-running never duplicates a game.
    /// </summary>
    private static async Task SeedFeaturedGamesAsync(AppDbContext context)
    {
        var titles = FeaturedGames.Select(g => g.Title).ToList();
        var existing = await context.Games
            .Where(g => titles.Contains(g.Title))
            .ToListAsync();
        var byTitle = existing
            .GroupBy(g => g.Title.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var (title, baseDifficulty) in FeaturedGames)
        {
            if (byTitle.TryGetValue(title.ToLowerInvariant(), out var game))
            {
                game.IsFeatured = true;
                game.PopularityRank = 0;
                continue;
            }

            context.Games.Add(new Game
            {
                Id = Guid.NewGuid(),
                Title = title,
                BaseDifficulty = baseDifficulty,
                IsFeatured = true,
                PopularityRank = 0
            });
        }

        await context.SaveChangesAsync();
    }
}
