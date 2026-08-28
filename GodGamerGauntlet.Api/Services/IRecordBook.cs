using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

public interface IRecordBook
{
    Task<IReadOnlyList<LeaderboardEntryDto>> GetBoardAsync(
        RunType runType,
        int limit,
        CancellationToken cancellationToken = default,
        string? season = null);

    Task<IReadOnlyList<LeaderboardEntryDto>> GetSurvivalBoardAsync(
        RunType runType,
        int limit,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SeasonChampionDto>> GetHallOfFameAsync(
        CancellationToken cancellationToken = default);

    Task<RunPlacementDto?> GetPlacementAsync(
        Guid runId,
        CancellationToken cancellationToken = default);

    /// <summary>Standard and Lite PB maps keyed by user id, for stamping a page of posts.</summary>
    Task<IReadOnlyDictionary<RunType, IReadOnlyList<PersonalBest>>> GetAllBoardsAsync(
        CancellationToken cancellationToken = default);

    Task<UserProfileDto?> GetProfileAsync(
        string username,
        Guid? viewerId = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<PlayerCardDto>> GetDirectoryAsync(
        CancellationToken cancellationToken = default);
}

public record PersonalBest(
    Guid RunId,
    Guid UserId,
    string Username,
    string? AvatarUrl,
    RunType RunType,
    double Score,
    int SlotsCompleted,
    long ElapsedMs,
    DateTime? EndTime,
    int Rank);
