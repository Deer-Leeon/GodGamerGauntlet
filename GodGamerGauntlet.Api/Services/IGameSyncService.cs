namespace GodGamerGauntlet.Api.Services;

/// <summary>Outcome of one RAWG catalog sync.</summary>
public record GameSyncResult(int GamesProcessed, int GamesAdded);

/// <summary>
/// Runs the RAWG ingestion (up to 500 pages × 40 most-added games = 20,000
/// games, rate-limited to one request per 1.5s — a full sync takes ~13 minutes)
/// and upserts the results into the game catalog. Triggered by the background
/// worker (every 24h) and fire-and-forget from the admin hard-reset.
/// </summary>
public interface IGameSyncService
{
    Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default);
}
