using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
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
        await SeedRosterTechAsync(context);
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
        referenced.UnionWith(await context.GameTeches.Select(t => t.GameId).Distinct().ToListAsync());

        var orphans = await context.Games
            .Where(g => !g.IsFeatured && !referenced.Contains(g.Id))
            .ToListAsync();

        if (orphans.Count == 0) return;

        context.Games.RemoveRange(orphans);
        await context.SaveChangesAsync();
    }

    /// <summary>
    /// Seeds a handful of published tricks on high-draft roster games.
    /// Idempotent on (game, slug).
    /// </summary>
    private static async Task SeedRosterTechAsync(AppDbContext context)
    {
        var abbreviations = RosterTechSeeds
            .Select(s => s.SrcAbbreviation)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var titles = GauntletRoster.Games
            .Where(g => abbreviations.Contains(g.SrcAbbreviation, StringComparer.OrdinalIgnoreCase))
            .Select(g => g.Title)
            .ToList();
        var games = await context.Games
            .Where(g => titles.Contains(g.Title))
            .ToListAsync();
        var byTitle = games.ToDictionary(g => g.Title, StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;

        foreach (var seed in RosterTechSeeds)
        {
            var entry = GauntletRoster.Games.FirstOrDefault(g =>
                g.SrcAbbreviation.Equals(seed.SrcAbbreviation, StringComparison.OrdinalIgnoreCase));
            if (entry is null || !byTitle.TryGetValue(entry.Title, out var game)) continue;
            var exists = await context.GameTeches.AnyAsync(t =>
                t.GameId == game.Id && t.Slug == seed.Slug);
            if (exists) continue;

            var url = ProofUrls.FirstAccepted([seed.ClipUrl]);
            var tech = new GameTech
            {
                Id = Guid.NewGuid(),
                GameId = game.Id,
                Slug = seed.Slug,
                Title = seed.Title,
                Summary = seed.Summary,
                BodyMarkdown = seed.Body,
                Kind = seed.Kind,
                Difficulty = seed.Difficulty,
                PatchScope = seed.PatchScope,
                VersionNote = seed.VersionNote,
                Prerequisites = seed.Prerequisites,
                Loadout = seed.Loadout,
                Status = GameTechStatus.Published,
                CreatedAt = now,
                UpdatedAt = now,
            };
            if (url is not null)
            {
                tech.Clips.Add(new GameTechClip
                {
                    Id = Guid.NewGuid(),
                    Provider = GameTechClipProvider.YouTube,
                    Url = url,
                    StartSeconds = seed.StartSeconds,
                    SortOrder = 0,
                });
            }

            context.GameTeches.Add(tech);
        }

        await context.SaveChangesAsync();
    }

    private sealed record TechSeed(
        string SrcAbbreviation,
        string Slug,
        string Title,
        string Summary,
        string Body,
        GameTechKind Kind,
        GameTechDifficulty Difficulty,
        GameTechPatchScope PatchScope,
        string? VersionNote,
        string? Prerequisites,
        string? Loadout,
        string ClipUrl,
        int? StartSeconds);

    private static readonly TechSeed[] RosterTechSeeds =
    [
        new(
            "celeste",
            "wavedash",
            "Wavedash",
            "Dash diagonally down onto the ground, wait for white hair, then jump to keep speed and regain your dash.",
            "From a short hop, dash down-diagonal into the floor. Do not jump on the first frame you land — wait until Madeline's hair flashes white, then jump. That restores the dash and throws you forward. Used constantly in Farewell and in Any% routing.",
            GameTechKind.Movement,
            GameTechDifficulty.Medium,
            GameTechPatchScope.All,
            null,
            "Dash unlocked",
            null,
            "https://www.youtube.com/watch?v=-fzcnDIpuZs",
            null),
        new(
            "sm64",
            "staircase-blj",
            "Staircase BLJ",
            "Backwards long jumps on stairs build enough speed to skip the 70-star door and the endless staircase.",
            "Long jump, immediately hold the opposite direction and Z, then mash A as Mario lands so each jump is shorter than a full long jump. On the lobby stairs this builds negative speed until Mario clips the star door. Harder on N64 than on some emulators because of the mash window.",
            GameTechKind.Glitch,
            GameTechDifficulty.FrameTight,
            GameTechPatchScope.VersionLocked,
            "N64 / VC; analog stick",
            "Long jump unlocked (Wing Cap not required)",
            "N64 controller or equivalent analog",
            "https://www.youtube.com/watch?v=tx9lmev-Ito",
            null),
        new(
            "sm64",
            "lobby-blj",
            "Lobby pillar BLJ",
            "BLJ in the lobby pillar to enter Bowser in the Dark World with far fewer stars.",
            "Sideflip or double jump into the corner of the pillar, then BLJ in place until you have enough speed to shoot through the lobby. Required for 16-star and low-star routes. Stop mashing before you overshoot or Mario passes through the far wall.",
            GameTechKind.Skip,
            GameTechDifficulty.FrameTight,
            GameTechPatchScope.VersionLocked,
            "N64 / VC",
            "Long jump",
            "N64 controller",
            "https://www.youtube.com/watch?v=gHvXUeisefw",
            null),
        new(
            "sm",
            "mockball",
            "Mockball",
            "Morph into a ball on landing without losing run speed. Opens early Super Missiles without fighting Spore Spawn.",
            "Run, jump, aim down, then tap down again just before you hit the ground so Samus soft-morphs and keeps horizontal speed. Hold the travel direction immediately after. Practice in a wide hallway before the Early Supers room, which has a tighter ceiling.",
            GameTechKind.Movement,
            GameTechDifficulty.Medium,
            GameTechPatchScope.All,
            null,
            "Morphing Ball",
            null,
            "https://www.youtube.com/watch?v=2z6lH7ldVHw",
            null),
    ];
}
