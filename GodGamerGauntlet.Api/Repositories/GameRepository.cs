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
}
