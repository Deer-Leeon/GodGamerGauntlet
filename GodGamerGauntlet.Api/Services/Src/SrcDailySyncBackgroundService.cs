namespace GodGamerGauntlet.Api.Services.Src;

/// <summary>
/// Runs the speedrun.com catalog sync at midnight UTC. The first boot only
/// records the upcoming midnight. A process that was down at midnight runs
/// on the next boot, because <see cref="SrcImportService.RunDueSyncAsync"/>
/// sees a <c>NextRunUtc</c> already in the past.
/// </summary>
public class SrcDailySyncBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<SrcDailySyncBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(30);
            try
            {
                using var scope = scopeFactory.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
                if (!importer.DailySyncEnabled)
                {
                    delay = TimeSpan.FromSeconds(30);
                }
                else
                {
                    var now = DateTime.UtcNow;
                    var state = await importer.EnsureDailyScheduleAsync(now, stoppingToken);
                    if (now < state.NextRunUtc)
                    {
                        delay = Cap(state.NextRunUtc - now);
                    }
                    else if (await importer.RunDueSyncAsync(now, stoppingToken))
                    {
                        delay = TimeSpan.Zero;
                    }
                    else
                    {
                        delay = TimeSpan.FromMinutes(1);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "SRC daily sync failed.");
                delay = TimeSpan.FromMinutes(20);
            }

            if (delay <= TimeSpan.Zero) continue;

            try
            {
                await Task.Delay(delay, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private static TimeSpan Cap(TimeSpan delay)
    {
        if (delay < TimeSpan.Zero) return TimeSpan.Zero;
        return delay > TimeSpan.FromHours(1) ? TimeSpan.FromHours(1) : delay;
    }
}
