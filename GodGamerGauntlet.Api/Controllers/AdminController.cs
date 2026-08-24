using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(
    AppDbContext context,
    IServiceScopeFactory scopeFactory,
    ILogger<AdminController> logger) : ControllerBase
{
    /// <summary>
    /// Wipes all runs and the entire game catalog, then kicks off the RAWG sync
    /// in the background. The catalog stays empty until that ingest finishes
    /// (~13 minutes). Users are preserved.
    /// </summary>
    [HttpPost("hard-reset")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> HardReset(CancellationToken cancellationToken)
    {
        logger.LogWarning("Hard reset requested: wiping runs and game catalog.");

        // Order matters: RunSlots reference Games with Restrict delete, so all
        // run data must go before the catalog can be cleared.
        var slotsDeleted = await context.RunSlots.ExecuteDeleteAsync(cancellationToken);
        var runsDeleted = await context.Runs.ExecuteDeleteAsync(cancellationToken);
        var gamesDeleted = await context.Games.ExecuteDeleteAsync(cancellationToken);

        await DbInitializer.SeedAsync(context);

        logger.LogWarning(
            "Hard reset complete: {Runs} runs, {Slots} slots, {Games} games deleted; catalog left empty. Starting RAWG sync in background.",
            runsDeleted, slotsDeleted, gamesDeleted);

        // Fire-and-forget with its own scope and no request-bound cancellation,
        // so the ingestion survives after this response is sent.
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var syncService = scope.ServiceProvider.GetRequiredService<IGameSyncService>();
                await syncService.SyncAsync(CancellationToken.None);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Background RAWG sync after hard reset failed.");
            }
        });

        return Ok(new
        {
            message = "Hard reset complete. Catalog wiped; RAWG sync started in the background (~13 minutes for the full 20,000-game catalog).",
            runsDeleted,
            slotsDeleted,
            gamesDeleted
        });
    }
}
