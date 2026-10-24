using GodGamerGauntlet.Api.Services.Src;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>In-memory speedrun.com stand-in. Tests populate the dictionaries.</summary>
public sealed class FakeSrcClient : ISrcClient
{
    public Dictionary<string, SrcGame> Games { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, SrcUser> ProfilesByKey { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, List<SrcPersonalBest>> PersonalBests { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, SrcLeaderboard> Leaderboards { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<SrcRun> Runs { get; } = [];
    public int RunRequests { get; set; }

    public string? LastApiKey { get; private set; }

    public Task<SrcGame?> GetGameAsync(string idOrAbbreviation, CancellationToken cancellationToken = default)
    {
        Games.TryGetValue(idOrAbbreviation, out var game);
        return Task.FromResult(game);
    }

    public Task<SrcLeaderboard?> GetLeaderboardAsync(
        string gameId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default)
    {
        var key = BoardKey(gameId, categoryId, variableFilters);
        Leaderboards.TryGetValue(key, out var board);
        if (board is null)
        {
            Leaderboards.TryGetValue(BoardKey(gameId, categoryId, null), out board);
        }

        return Task.FromResult(board);
    }

    public Task<SrcLeaderboard?> GetLevelLeaderboardAsync(
        string gameId,
        string levelId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default)
    {
        var key = $"{gameId}/level/{levelId}/{categoryId}";
        Leaderboards.TryGetValue(key, out var board);
        return Task.FromResult(board);
    }

    public Task<string?> GetPlatformNameAsync(string platformId, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    public Task<string?> GetRegionNameAsync(string regionId, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    public Task<string?> GetUserNameAsync(string userId, CancellationToken cancellationToken = default) =>
        Task.FromResult<string?>(null);

    public Task<SrcUser?> GetProfileAsync(string apiKey, CancellationToken cancellationToken = default)
    {
        LastApiKey = apiKey;
        ProfilesByKey.TryGetValue(apiKey, out var user);
        return Task.FromResult(user);
    }

    public Task<IReadOnlyList<SrcPersonalBest>> GetPersonalBestsAsync(
        string srcUserId, CancellationToken cancellationToken = default)
    {
        PersonalBests.TryGetValue(srcUserId, out var list);
        IReadOnlyList<SrcPersonalBest> result = list ?? [];
        return Task.FromResult(result);
    }

    public Task<SrcRunPage> GetRunsAsync(SrcRunQuery query, CancellationToken cancellationToken = default)
    {
        RunRequests++;
        if (query.Offset >= 10_000)
        {
            throw new SrcOffsetCapException();
        }

        IEnumerable<SrcRun> rows = Runs.Where(run => SrcRunIds.AsId(run.Game) == query.GameId);
        if (!string.IsNullOrEmpty(query.CategoryId))
            rows = rows.Where(run => SrcRunIds.AsId(run.Category) == query.CategoryId);
        if (!string.IsNullOrEmpty(query.Status))
            rows = rows.Where(run => string.Equals(run.Status?.Status, query.Status, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrEmpty(query.LevelId))
            rows = rows.Where(run => SrcRunIds.AsId(run.Level) == query.LevelId);
        if (!string.IsNullOrEmpty(query.PlatformId))
            rows = rows.Where(run => SrcRunIds.AsId(run.System?.Platform) == query.PlatformId);
        if (!string.IsNullOrEmpty(query.RegionId))
            rows = rows.Where(run => SrcRunIds.AsId(run.System?.Region) == query.RegionId);
        if (query.Emulated is bool emulated)
            rows = rows.Where(run => (run.System?.Emulated == true) == emulated);

        var page = rows.Skip(query.Offset).Take(query.Max).ToList();
        return Task.FromResult(new SrcRunPage { Data = page });
    }

    public static string BoardKey(
        string gameId, string categoryId, IReadOnlyDictionary<string, string>? filters)
    {
        var suffix = "";
        if (filters is { Count: > 0 })
        {
            suffix = string.Join('&', filters.OrderBy(kv => kv.Key).Select(kv => $"{kv.Key}={kv.Value}"));
        }

        return $"{gameId}/{categoryId}?{suffix}";
    }
}
