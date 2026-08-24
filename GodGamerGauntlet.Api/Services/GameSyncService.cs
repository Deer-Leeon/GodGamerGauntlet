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
    private const int DefaultDifficulty = 70;

    public async Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default)
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
