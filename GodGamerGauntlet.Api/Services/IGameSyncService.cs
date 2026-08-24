namespace GodGamerGauntlet.Api.Services;

/// <summary>Outcome of one CheapShark catalog sync.</summary>
public record GameSyncResult(int GamesProcessed, int GamesAdded);

/// <summary>
/// Runs the dual-pass CheapShark ingestion (AAA hits + highly rated deals)
/// and upserts the results into the game catalog. Callable on demand
/// (admin hard-reset) and on a schedule (background worker).
/// </summary>
public interface IGameSyncService
{
    Task<GameSyncResult> SyncAsync(CancellationToken cancellationToken = default);
}
