using System.Globalization;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Periodically ingests a curated Steam catalog from CheapShark into PostgreSQL.
/// Runs once at startup, then every 12 hours. Two targeted queries (AAA hits and
/// highly rated games) are spaced by a strict 1.5s delay to respect CheapShark's
/// rate limits.
/// </summary>
public class GameSyncBackgroundService(
    CheapSharkClient cheapShark,
    IServiceScopeFactory scopeFactory,
    ILogger<GameSyncBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan SyncInterval = TimeSpan.FromHours(12);
    private static readonly TimeSpan RequestDelay = TimeSpan.FromMilliseconds(1500);
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
        logger.LogInformation("Starting CheapShark game sync (AAA hits + highly rated).");

        // Pass 1: AAA titles ordered by review volume.
        var aaaHits = await cheapShark.GetAaaHitsAsync(cancellationToken);

        // Strict spacing between requests to avoid CheapShark rate limits / IP bans.
        await Task.Delay(RequestDelay, cancellationToken);

        // Pass 2: critically acclaimed games (Metacritic 80+, 1000+ reviews).
        var highlyRated = await cheapShark.GetHighlyRatedAsync(cancellationToken);

        // Combine and deduplicate by CheapShark gameID (our ExternalId);
        // the AAA pass wins when a game appears in both.
        var dealsByGameId = new Dictionary<string, CheapSharkDeal>();
        foreach (var deal in aaaHits.Concat(highlyRated))
        {
            dealsByGameId.TryAdd(deal.GameId, deal);
        }

        logger.LogInformation(
            "CheapShark returned {Aaa} AAA hits and {Rated} highly rated deals ({Unique} unique games).",
            aaaHits.Count, highlyRated.Count, dealsByGameId.Count);

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
