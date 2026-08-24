using System.Globalization;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Periodically ingests the Steam deals catalog from CheapShark into PostgreSQL.
/// Runs once at startup, then every 12 hours. Pages are fetched with a strict
/// 1.5s delay between requests to respect CheapShark's rate limits.
/// </summary>
public class GameSyncBackgroundService(
    CheapSharkClient cheapShark,
    IServiceScopeFactory scopeFactory,
    ILogger<GameSyncBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan SyncInterval = TimeSpan.FromHours(12);
    private static readonly TimeSpan PageDelay = TimeSpan.FromMilliseconds(1500);
    private const int PagesToFetch = 2;
    private const int DefaultDifficulty = 70;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never crash the host over a failed sync; try again next cycle.
                logger.LogError(ex, "CheapShark game sync failed; retrying in {Interval}.", SyncInterval);
            }

            try
            {
                await Task.Delay(SyncInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task SyncAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Starting CheapShark game sync ({Pages} pages).", PagesToFetch);

        var dealsByGameId = new Dictionary<string, CheapSharkDeal>();

        for (var page = 0; page < PagesToFetch; page++)
        {
            if (page > 0)
            {
                // Strict spacing between requests to avoid CheapShark rate limits / IP bans.
                await Task.Delay(PageDelay, cancellationToken);
            }

            var deals = await cheapShark.GetSteamDealsPageAsync(page, cancellationToken);
            foreach (var deal in deals)
            {
                // The same game can appear in several deals; keep the first (best-ranked).
                dealsByGameId.TryAdd(deal.GameId, deal);
            }

            if (deals.Count == 0)
            {
                break;
            }
        }

        var games = dealsByGameId.Values
            .Where(d => !string.IsNullOrWhiteSpace(d.Title))
            .Select(MapToGame)
            .ToList();

        if (games.Count == 0)
        {
            logger.LogWarning("CheapShark returned no deals; keeping the existing catalog.");
            return;
        }

        // BackgroundService is a singleton; repositories/DbContext are scoped.
        using var scope = scopeFactory.CreateScope();
        var gameRepository = scope.ServiceProvider.GetRequiredService<IGameRepository>();
        var added = await gameRepository.UpsertGamesAsync(games, cancellationToken);

        logger.LogInformation(
            "CheapShark sync complete: {Total} games processed, {Added} newly added.",
            games.Count, added);
    }

    private static Game MapToGame(CheapSharkDeal deal) => new()
    {
        Id = Guid.NewGuid(),
        ExternalId = deal.GameId,
        Title = deal.Title.Length > 200 ? deal.Title[..200] : deal.Title,
        Thumb = deal.Thumb,
        NormalPrice = ParsePrice(deal.NormalPrice),
        SalePrice = ParsePrice(deal.SalePrice),
        BaseDifficulty = DeriveDifficulty(deal)
    };

    private static decimal ParsePrice(string value) =>
        decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0m;

    /// <summary>
    /// CheapShark has no difficulty concept, so we derive one from review data:
    /// Metacritic score when available, otherwise the Steam rating percent,
    /// clamped to the 1-100 check constraint. Hand-seeded games keep their
    /// curated difficulty (the upsert never overwrites it).
    /// </summary>
    private static int DeriveDifficulty(CheapSharkDeal deal)
    {
        if (int.TryParse(deal.MetacriticScore, out var metacritic) && metacritic > 0)
        {
            return Math.Clamp(metacritic, 1, 100);
        }

        if (int.TryParse(deal.SteamRatingPercent, out var steamRating) && steamRating > 0)
        {
            return Math.Clamp(steamRating, 1, 100);
        }

        return DefaultDifficulty;
    }
}
