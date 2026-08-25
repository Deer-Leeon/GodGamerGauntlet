using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IGameRepository
{
    Task<IReadOnlyList<Game>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Game?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Game>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default);

    Task<Game> AddAsync(Game game, CancellationToken cancellationToken = default);

    /// <summary>
    /// True once RAWG has been ingested. Ignores curated featured games so the
    /// seeded staples cannot make the sync think the catalog is already built.
    /// </summary>
    Task<bool> HasIngestedCatalogAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts new games and refreshes store data (thumb, prices, popularity rank)
    /// on existing ones, matching by ExternalId first and then case-insensitive
    /// title. Never clears <see cref="Game.IsFeatured"/>. Returns the number added.
    /// </summary>
    Task<int> UpsertGamesAsync(IReadOnlyList<Game> games, CancellationToken cancellationToken = default);
}
