using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IGameRepository
{
    Task<IReadOnlyList<Game>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Game?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Game>> GetByIdsAsync(IEnumerable<Guid> ids, CancellationToken cancellationToken = default);

    Task<Game> AddAsync(Game game, CancellationToken cancellationToken = default);
}
