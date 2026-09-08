namespace GodGamerGauntlet.Api.Services.Src;

public interface ISrcClient
{
    Task<SrcGame?> GetGameAsync(string idOrAbbreviation, CancellationToken cancellationToken = default);

    Task<SrcLeaderboard?> GetLeaderboardAsync(
        string gameId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default);

    Task<SrcUser?> GetProfileAsync(string apiKey, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SrcPersonalBest>> GetPersonalBestsAsync(
        string srcUserId,
        CancellationToken cancellationToken = default);
}
