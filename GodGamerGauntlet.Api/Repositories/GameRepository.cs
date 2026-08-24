using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Repositories;

public class GameRepository(AppDbContext context) : IGameRepository
{
    public async Task<IReadOnlyList<Game>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await context.Games
            .AsNoTracking()
            .OrderBy(g => g.Title)
            .ToListAsync(cancellationToken);
    }

    public async Task<Game?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Games
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == id, cancellationToken);
    }

    public async Task<IReadOnlyList<Game>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default)
    {
        var idSet = ids.Distinct().ToList();

        return await context.Games
            .AsNoTracking()
            .Where(g => idSet.Contains(g.Id))
            .ToListAsync(cancellationToken);
    }

    public async Task<Game> AddAsync(Game game, CancellationToken cancellationToken = default)
    {
        context.Games.Add(game);
        await context.SaveChangesAsync(cancellationToken);
        return game;
    }

    public Task<bool> AnyAsync(CancellationToken cancellationToken = default) =>
        context.Games.AnyAsync(cancellationToken);

    public async Task<int> UpsertGamesAsync(IReadOnlyList<Game> games, CancellationToken cancellationToken = default)
    {
        var existing = await context.Games.ToListAsync(cancellationToken);
        var byExternalId = existing
            .Where(g => g.ExternalId is not null)
            .ToDictionary(g => g.ExternalId!);
        var byTitle = existing
            .GroupBy(g => g.Title.ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First());

        var added = 0;

        foreach (var incoming in games)
        {
            var match =
                (incoming.ExternalId is not null && byExternalId.TryGetValue(incoming.ExternalId, out var byId)
                    ? byId
                    : null)
                ?? byTitle.GetValueOrDefault(incoming.Title.ToLowerInvariant());

            if (match is null)
            {
                context.Games.Add(incoming);
                byTitle[incoming.Title.ToLowerInvariant()] = incoming;
                if (incoming.ExternalId is not null)
                {
                    byExternalId[incoming.ExternalId] = incoming;
                }
                added++;
                continue;
            }

            // Refresh store data but keep the curated difficulty of existing entries.
            match.ExternalId ??= incoming.ExternalId;
            match.Thumb = incoming.Thumb ?? match.Thumb;
            match.NormalPrice = incoming.NormalPrice;
            match.SalePrice = incoming.SalePrice;
        }

        await context.SaveChangesAsync(cancellationToken);
        return added;
    }
}
