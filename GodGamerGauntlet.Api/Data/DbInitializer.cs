using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext context)
    {
        await context.Database.MigrateAsync();
        await SeedAsync(context);
    }

    /// <summary>Restores the hand-curated baseline (15 games, demo user) into empty tables. Idempotent.</summary>
    public static async Task SeedAsync(AppDbContext context)
    {
        if (!await context.Games.AnyAsync())
        {
            context.Games.AddRange(SeedGames());
        }

        if (!await context.Users.AnyAsync())
        {
            context.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                Username = "GodGamerDemo",
                CreatedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync();
    }

    private static IEnumerable<Game> SeedGames()
    {
        var titlesWithDifficulty = new (string Title, int BaseDifficulty)[]
        {
            ("Street Fighter 6", 85),
            ("Fall Guys", 65),
            ("GeoGuessr", 75),
            ("Chess.com", 80),
            ("Getting Over It", 90),
            ("Mario Kart 8 Deluxe", 60),
            ("Brawlhalla", 70),
            ("Rocket League", 85),
            ("Apex Legends", 90),
            ("Trackmania", 75),
            ("Lethal Company", 50),
            ("Overwatch 2", 80),
            ("Tetris 99", 75),
            ("Tekken 8", 85),
            ("Valorant", 90)
        };

        return titlesWithDifficulty.Select(g => new Game
        {
            Id = Guid.NewGuid(),
            Title = g.Title,
            BaseDifficulty = g.BaseDifficulty
        });
    }
}
