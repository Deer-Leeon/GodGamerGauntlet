namespace GodGamerGauntlet.Api.Services.Src;

public interface ISrcClient
{
    Task<SrcGame?> GetGameAsync(string idOrAbbreviation, CancellationToken cancellationToken = default);

    Task<SrcLeaderboard?> GetLeaderboardAsync(
        string gameId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default);

    Task<SrcLeaderboard?> GetLevelLeaderboardAsync(
        string gameId,
        string levelId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default);

    Task<string?> GetPlatformNameAsync(string platformId, CancellationToken cancellationToken = default);

    Task<string?> GetRegionNameAsync(string regionId, CancellationToken cancellationToken = default);

    Task<string?> GetUserNameAsync(string userId, CancellationToken cancellationToken = default);

    Task<SrcUser?> GetProfileAsync(string apiKey, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SrcPersonalBest>> GetPersonalBestsAsync(
        string srcUserId,
        CancellationToken cancellationToken = default);

    Task<SrcRunPage> GetRunsAsync(SrcRunQuery query, CancellationToken cancellationToken = default);
}

public sealed record SrcRunQuery(
    string GameId,
    string? CategoryId,
    string? Status,
    string? LevelId,
    string? PlatformId,
    string? RegionId,
    bool? Emulated,
    int Max,
    int Offset,
    string OrderBy = "submitted",
    string Direction = "asc");

public sealed class SrcRunPage
{
    public List<SrcRun> Data { get; init; } = [];
}

/// <summary>The runs endpoint refuses to page once offset reaches 10,000.</summary>
public sealed class SrcOffsetCapException : Exception
{
    public SrcOffsetCapException()
        : base("speedrun.com refused to page past 10,000 runs for this query.")
    {
    }
}
