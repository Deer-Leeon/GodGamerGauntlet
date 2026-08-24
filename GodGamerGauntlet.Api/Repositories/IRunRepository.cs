using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IRunRepository
{
    /// <summary>
    /// Top finished runs ranked by earned score (sum of won-slot scores),
    /// with Completed outranking Failed on ties, then most recent first.
    /// </summary>
    Task<IReadOnlyList<LeaderboardEntryDto>> GetLeaderboardAsync(int limit, CancellationToken cancellationToken = default);

    Task<Run?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Loads a run with slots tracked by the context, for mutation.</summary>
    Task<Run?> GetByIdTrackedAsync(Guid id, CancellationToken cancellationToken = default);

    Task<Run> AddAsync(Run run, CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);

    Task<bool> UserExistsAsync(Guid userId, CancellationToken cancellationToken = default);
}
