namespace GodGamerGauntlet.Api.Services;

/// <summary>Outcome of one CheapShark catalog sync.</summary>
public record GameSyncResult(int GamesProcessed, int GamesAdded);

/// <summary>
/// Runs the CheapShark ingestion (100 pages of top-reviewed Steam deals,
/// ~6,000 games, rate-limited to one request per 1.5s — takes ~2.5 minutes)
/// and upserts the results into the game catalog. Callable on demand
/// (admin hard-reset) and on a schedule (background worker).
/// </summary>
public interface IGameSyncService
{
    Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default);
}
