using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public static class DbInitializer
{
    /// <summary>
    /// Competitive staples that must head the draft catalog regardless of what
    /// RAWG's most-added ordering says. RAWG titles match RAWG's naming so the
    /// sync merges into those rows; web-native titles use a synthetic ExternalId
    /// so restarts upsert instead of inserting a second row.
    /// </summary>
    private static readonly (
        string Title,
        int BaseDifficulty,
        string? ExternalId,
        string? Thumb
    )[] FeaturedGames =
    [
        ("Counter-Strike 2", 92, null, null),
        ("League of Legends", 90, null, null),
        ("Dota 2", 95, null, null),
        ("VALORANT", 88, null, null),
        ("Tekken 7", 85, null, null),
        ("Super Smash Bros. Melee", 93, null, null),
        ("Street Fighter 6", 84, null, null),
        ("Rocket League", 80, null, null),
        ("Overwatch 2", 78, null, null),
        ("Apex Legends", 82, null, null),
        ("Fortnite", 76, null, null),
        ("StarCraft II", 94, null, null),
        (
            "Chess.com",
            95,
            "web-chess-com",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Chesscom_logo_pawn_flat.svg/330px-Chesscom_logo_pawn_flat.svg.png"
        ),
        (
            "GeoGuessr",
            85,
            "web-geoguessr",
            "https://upload.wikimedia.org/wikipedia/commons/b/b4/GeoGuessr_logo.png"
        )
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
    /// <c>PopularityRank = 0</c>. Matches by ExternalId first, then
    /// case-insensitive title — the same keys as <c>UpsertGamesAsync</c> — so
    /// re-running never duplicates a game.
    /// </summary>
    private static async Task SeedFeaturedGamesAsync(AppDbContext context)
    {
        var titles = FeaturedGames.Select(g => g.Title).ToList();
        var externalIds = FeaturedGames
            .Select(g => g.ExternalId)
            .Where(id => id is not null)
            .Cast<string>()
            .ToList();

        var existing = await context.Games
            .Where(g =>
                titles.Contains(g.Title)
                || (g.ExternalId != null && externalIds.Contains(g.ExternalId)))
            .ToListAsync();
        var byTitle = existing
            .GroupBy(g => g.Title.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());
        var byExternalId = existing
            .Where(g => g.ExternalId is not null)
            .ToDictionary(g => g.ExternalId!);

        foreach (var (title, baseDifficulty, externalId, thumb) in FeaturedGames)
        {
            var match =
                (externalId is not null
                    && byExternalId.TryGetValue(externalId, out var byId)
                    ? byId
                    : null)
                ?? byTitle.GetValueOrDefault(title.ToLowerInvariant());

            if (match is not null)
            {
                match.IsFeatured = true;
                match.PopularityRank = 0;
                match.ExternalId ??= externalId;
                // Seed thumbs must overwrite: the first web-native URLs 404'd,
                // and `??=` would have left those broken strings in place forever.
                if (thumb is not null)
                {
                    match.Thumb = thumb;
                }
                continue;
            }

            var inserted = new Game
            {
                Id = Guid.NewGuid(),
                Title = title,
                BaseDifficulty = baseDifficulty,
                ExternalId = externalId,
                Thumb = thumb,
                IsFeatured = true,
                PopularityRank = 0
            };
            context.Games.Add(inserted);
            byTitle[title.ToLowerInvariant()] = inserted;
            if (externalId is not null)
            {
                byExternalId[externalId] = inserted;
            }
        }

        await context.SaveChangesAsync();
    }
}
