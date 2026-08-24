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

        // Serverless cold-starts would otherwise re-run all 500 pages (~12 min,
        // 500 RAWG requests) on every wake. Only ingest when the catalog is empty
        // (first boot or after hard-reset).
        if (await gameRepository.AnyAsync(cancellationToken))
        {
            logger.LogInformation("RAWG sync skipped: catalog already populated.");
            return new GameSyncResult(0, 0);
        }

        logger.LogInformation(
            "Starting RAWG game sync: up to {Pages} pages of most-added games (~{Duration:F0} min).",
            PagesToFetch, PagesToFetch * RequestDelay.TotalMinutes);

        // Deduplicate by RAWG game id (our ExternalId). Flush to the DB every
        // 25 pages so a late timeout cannot throw away the whole catalog.
        var gamesByExternalId = new Dictionary<string, Game>();
        var pending = new List<Game>();
        var added = 0;

        for (var page = 1; page <= PagesToFetch; page++)
        {
            if (page > 1)
            {
                // Strict spacing between requests to respect RAWG rate limits.
                await Task.Delay(RequestDelay, cancellationToken);
            }

            IReadOnlyList<RawgGame> results;
            try
            {
                results = await rawg.GetTopGamesAsync(page, cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "RAWG page {Page} failed; continuing.", page);
                continue;
            }

            if (results.Count == 0)
            {
                logger.LogInformation("RAWG ran out of games at page {Page}; stopping early.", page);
                break;
            }

            foreach (var rawgGame in results)
            {
                if (string.IsNullOrWhiteSpace(rawgGame.Name)) continue;
                var game = MapToGame(rawgGame);
                if (gamesByExternalId.TryAdd(rawgGame.Id.ToString(), game))
                {
                    pending.Add(game);
                }
            }

            if (page % 25 == 0)
            {
                added += await FlushPendingAsync(pending, cancellationToken);
                logger.LogInformation(
                    "RAWG sync progress: {Pages}/{Total} pages fetched, {Unique} unique games so far.",
                    page, PagesToFetch, gamesByExternalId.Count);
            }
        }

        added += await FlushPendingAsync(pending, cancellationToken);

        if (gamesByExternalId.Count == 0)
        {
            logger.LogWarning("RAWG returned no games; keeping the existing catalog.");
            return new GameSyncResult(0, 0);
        }

        logger.LogInformation(
            "RAWG sync complete: {Total} games processed, {Added} newly added.",
            gamesByExternalId.Count, added);

        return new GameSyncResult(gamesByExternalId.Count, added);
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

    private async Task<int> FlushPendingAsync(List<Game> pending, CancellationToken cancellationToken)
    {
        if (pending.Count == 0) return 0;
        var added = await gameRepository.UpsertGamesAsync(pending, cancellationToken);
        pending.Clear();
        return added;
    }
}
