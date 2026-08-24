using System.Globalization;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;

namespace GodGamerGauntlet.Api.Services;

public class GameSyncService(
    CheapSharkClient cheapShark,
    IGameRepository gameRepository,
    ILogger<GameSyncService> logger) : IGameSyncService
{
    private static readonly TimeSpan RequestDelay = TimeSpan.FromMilliseconds(1500);
    private const int PagesToFetch = 100;
    private const int DefaultDifficulty = 70;

    public async Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Starting CheapShark game sync: up to {Pages} pages of top-reviewed Steam deals (~{Duration:F0} min).",
            PagesToFetch, PagesToFetch * RequestDelay.TotalMinutes);

        // Aggregate all pages, deduplicating by CheapShark gameID (our ExternalId);
        // the same game can appear in multiple deals, first (most-reviewed) wins.
        var dealsByGameId = new Dictionary<string, CheapSharkDeal>();

        for (var page = 0; page < PagesToFetch; page++)
        {
            if (page > 0)
            {
                // Strict spacing between requests to avoid CheapShark rate limits / IP bans.
                await Task.Delay(RequestDelay, cancellationToken);
            }

            var deals = await cheapShark.GetTopReviewedDealsAsync(page, cancellationToken);
            if (deals.Count == 0)
            {
                logger.LogInformation("CheapShark ran out of deals at page {Page}; stopping early.", page);
                break;
            }

            foreach (var deal in deals)
            {
                dealsByGameId.TryAdd(deal.GameId, deal);
            }

            if ((page + 1) % 10 == 0)
            {
                logger.LogInformation(
                    "CheapShark sync progress: {Pages}/{Total} pages fetched, {Unique} unique games so far.",
                    page + 1, PagesToFetch, dealsByGameId.Count);
            }
        }

        var games = dealsByGameId.Values
            .Where(d => !string.IsNullOrWhiteSpace(d.Title))
            .Select(MapToGame)
            .ToList();

        if (games.Count == 0)
        {
            logger.LogWarning("CheapShark returned no deals; keeping the existing catalog.");
            return new GameSyncResult(0, 0);
        }

        var added = await gameRepository.UpsertGamesAsync(games, cancellationToken);

        logger.LogInformation(
            "CheapShark sync complete: {Total} games processed, {Added} newly added.",
            games.Count, added);

        return new GameSyncResult(games.Count, added);
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
