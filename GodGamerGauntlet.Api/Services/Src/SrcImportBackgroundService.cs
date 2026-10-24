namespace GodGamerGauntlet.Api.Services.Src;

/// <summary>
/// Drains speedrun.com import cursors one page at a time. A new job starts
/// only from the admin endpoint; a restart continues unfinished cursors and
/// does nothing when the queue is empty or bulk import is off.
/// </summary>
public class SrcImportBackgroundService(
    IServiceScopeFactory scopeFactory,
    ILogger<SrcImportBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(15);
            try
            {
                using var scope = scopeFactory.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
                if (!importer.BulkEnabled)
                {
                    delay = TimeSpan.FromSeconds(30);
                }
                else if (await importer.ProcessNextAsync(stoppingToken))
                {
                    delay = TimeSpan.Zero;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "SRC import step failed.");
                delay = TimeSpan.FromSeconds(20);
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
}
