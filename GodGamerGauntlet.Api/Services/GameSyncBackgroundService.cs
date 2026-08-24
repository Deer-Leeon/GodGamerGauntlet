namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Schedules the CheapShark catalog sync: once at startup, then every 4 hours
/// to keep pricing fresh. The actual ingestion lives in <see cref="IGameSyncService"/>
/// so it can also be triggered on demand (admin hard-reset).
/// </summary>
public class GameSyncBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<GameSyncBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan SyncInterval = TimeSpan.FromHours(4);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // BackgroundService is a singleton; the sync service and its
                // repository/DbContext are scoped, so resolve them per cycle.
                using var scope = scopeFactory.CreateScope();
                var syncService = scope.ServiceProvider.GetRequiredService<IGameSyncService>();
                await syncService.SyncAsync(stoppingToken);
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
}
