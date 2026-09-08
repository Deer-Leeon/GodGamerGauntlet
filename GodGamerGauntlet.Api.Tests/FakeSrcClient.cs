using GodGamerGauntlet.Api.Services.Src;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>In-memory speedrun.com stand-in. Tests populate the dictionaries.</summary>
public sealed class FakeSrcClient : ISrcClient
{
    public Dictionary<string, SrcGame> Games { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, SrcUser> ProfilesByKey { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, List<SrcPersonalBest>> PersonalBests { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, SrcLeaderboard> Leaderboards { get; } = new(StringComparer.OrdinalIgnoreCase);

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
