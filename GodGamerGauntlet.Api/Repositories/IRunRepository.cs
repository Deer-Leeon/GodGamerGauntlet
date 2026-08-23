using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IRunRepository
{
    Task<Run?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<Run> AddAsync(Run run, CancellationToken cancellationToken = default);

    Task<bool> UserExistsAsync(Guid userId, CancellationToken cancellationToken = default);
}
