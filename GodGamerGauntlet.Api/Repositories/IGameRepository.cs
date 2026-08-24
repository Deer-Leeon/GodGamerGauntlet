using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IGameRepository
{
    Task<IReadOnlyList<Game>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Game?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Game>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default);

    Task<Game> AddAsync(Game game, CancellationToken cancellationToken = default);

    Task<bool> AnyAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts new games and refreshes store data (thumb, prices) on existing ones,
    /// matching by ExternalId first and then case-insensitive title.
    /// Returns the number of games added.
    /// </summary>
    Task<int> UpsertGamesAsync(IReadOnlyList<Game> games, CancellationToken cancellationToken = default);
}
