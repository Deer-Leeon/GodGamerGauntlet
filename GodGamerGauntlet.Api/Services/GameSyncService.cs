using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;

namespace GodGamerGauntlet.Api.Services;

public class GameSyncService(
    RawgClient rawg,
    IGameRepository gameRepository,
    ILogger<GameSyncService> logger) : IGameSyncService
{
    private static readonly TimeSpan RequestDelay = TimeSpan.FromMilliseconds(1500);
    private const int PagesToFetch = 500;
    private const int DefaultDifficulty = 70;

    public async Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default)
    {
        if (!rawg.IsConfigured)
        {
            logger.LogWarning("RAWG sync skipped: no RawgApiKey configured.");
            return new GameSyncResult(0, 0);
        }

        logger.LogInformation(
            "Starting RAWG game sync: up to {Pages} pages of most-added games (~{Duration:F0} min).",
            PagesToFetch, PagesToFetch * RequestDelay.TotalMinutes);

        // Aggregate all pages, deduplicating by RAWG game id (our ExternalId).
        var gamesByExternalId = new Dictionary<string, Game>();

        for (var page = 1; page <= PagesToFetch; page++)
        {
            if (page > 1)
            {
                // Strict spacing between requests to respect RAWG rate limits.
                await Task.Delay(RequestDelay, cancellationToken);
            }

            var results = await rawg.GetTopGamesAsync(page, cancellationToken);
            if (results.Count == 0)
            {
                logger.LogInformation("RAWG ran out of games at page {Page}; stopping early.", page);
                break;
            }

            foreach (var rawgGame in results)
            {
                if (string.IsNullOrWhiteSpace(rawgGame.Name)) continue;
                gamesByExternalId.TryAdd(rawgGame.Id.ToString(), MapToGame(rawgGame));
            }

            if (page % 25 == 0)
            {
                logger.LogInformation(
                    "RAWG sync progress: {Pages}/{Total} pages fetched, {Unique} unique games so far.",
                    page, PagesToFetch, gamesByExternalId.Count);
            }
        }

        var games = gamesByExternalId.Values.ToList();

        if (games.Count == 0)
        {
            logger.LogWarning("RAWG returned no games; keeping the existing catalog.");
            return new GameSyncResult(0, 0);
        }

        var added = await gameRepository.UpsertGamesAsync(games, cancellationToken);

        logger.LogInformation(
            "RAWG sync complete: {Total} games processed, {Added} newly added.",
            games.Count, added);

        return new GameSyncResult(games.Count, added);
    }

    private static Game MapToGame(RawgGame rawgGame) => new()
    {
        Id = Guid.NewGuid(),
        ExternalId = rawgGame.Id.ToString(),
        Title = rawgGame.Name.Length > 200 ? rawgGame.Name[..200] : rawgGame.Name,
        Thumb = rawgGame.BackgroundImage,
        NormalPrice = null,
        SalePrice = null,
        BaseDifficulty = rawgGame.Metacritic is > 0
            ? Math.Clamp(rawgGame.Metacritic.Value, 1, 100)
            : DefaultDifficulty
    };
}
