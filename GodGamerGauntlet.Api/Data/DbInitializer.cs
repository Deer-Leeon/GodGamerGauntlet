using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext context)
    {
        if (context.Database.IsNpgsql())
        {
            await context.Database.MigrateAsync();
        }
        else
        {
            // Integration tests swap in SQLite; Npgsql migrations can't run there.
            await context.Database.EnsureCreatedAsync();
        }

        await SeedAsync(context);
    }

    /// <summary>
    /// Seeds the demo user and the closed <see cref="GauntletRoster"/> catalog.
    /// Idempotent.
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

        await PromoteFounderAdminAsync(context);
        await SeedRosterGamesAsync(context);
        await RetireNonRosterGamesAsync(context);
    }

    /// <summary>
    /// There is no in-app "make admin" control. Until that exists, the site
    /// owner is promoted on boot if the account is present. Idempotent.
    /// </summary>
    private static async Task PromoteFounderAdminAsync(AppDbContext context)
    {
        var founder = await context.Users
            .FirstOrDefaultAsync(u => u.Username.ToLower() == "ljbuchie");
        if (founder is null || founder.IsAdmin) return;

        founder.IsAdmin = true;
        await context.SaveChangesAsync();
    }

    /// <summary>
    /// Upserts the roster and pins it with <c>IsFeatured = true</c> — the flag
    /// now means "in the catalog", and every query filters on it. Matches by
    /// case-insensitive title so an earlier RAWG row is reused (keeping its
    /// cover art) instead of duplicated.
    /// </summary>
    private static async Task SeedRosterGamesAsync(AppDbContext context)
    {
        var titles = GauntletRoster.Games.Select(g => g.Title).ToList();

        var byTitle = (await context.Games
                .Where(g => titles.Contains(g.Title))
                .ToListAsync())
            .GroupBy(g => g.Title.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        for (var rank = 0; rank < GauntletRoster.Games.Count; rank++)
        {
            var entry = GauntletRoster.Games[rank];
            var match = byTitle.GetValueOrDefault(entry.Title.ToLowerInvariant());

            if (match is not null)
            {
                match.IsFeatured = true;
                match.PopularityRank = rank;
                match.BaseDifficulty = entry.BaseDifficulty;
                if (entry.Thumb is not null)
                {
                    match.Thumb = entry.Thumb;
                }
                continue;
            }

            context.Games.Add(new Game
            {
                Id = Guid.NewGuid(),
                Title = entry.Title,
                BaseDifficulty = entry.BaseDifficulty,
                Thumb = entry.Thumb,
                IsFeatured = true,
                PopularityRank = rank
            });
        }

        await context.SaveChangesAsync();
    }

    /// <summary>
    /// Takes everything outside the roster off the catalog, then hard-deletes
    /// the rows nothing points at. A leftover game that still has run slots,
    /// boards, or submissions keeps its row so that history stays readable by
    /// id — it just stops appearing in the Draft Room and records directory.
    /// </summary>
    private static async Task RetireNonRosterGamesAsync(AppDbContext context)
    {
        var stale = await context.Games
            .Where(g => g.IsFeatured)
            .ToListAsync();
        stale = stale.Where(g => !GauntletRoster.Contains(g.Title)).ToList();

        foreach (var game in stale)
        {
            game.IsFeatured = false;
        }

        await context.SaveChangesAsync();

        // EF cannot translate this to a single delete across five dependents on
        // every provider, so gather the referenced ids first.
        var referenced = new HashSet<Guid>();
        referenced.UnionWith(await context.RunSlots.Select(s => s.GameId).Distinct().ToListAsync());
        referenced.UnionWith(await context.Categories.Select(c => c.GameId).Distinct().ToListAsync());
        referenced.UnionWith(await context.Submissions.Select(s => s.GameId).Distinct().ToListAsync());
        referenced.UnionWith(await context.GameModerators.Select(m => m.GameId).Distinct().ToListAsync());
        referenced.UnionWith(await context.GameSrcLinks.Select(l => l.GameId).Distinct().ToListAsync());

        var orphans = await context.Games
            .Where(g => !g.IsFeatured && !referenced.Contains(g.Id))
            .ToListAsync();

        if (orphans.Count == 0) return;

        context.Games.RemoveRange(orphans);
        await context.SaveChangesAsync();
    }
}
