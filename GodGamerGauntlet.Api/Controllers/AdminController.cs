using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(
    AppDbContext context,
    IGameSyncService gameSyncService,
    ILogger<AdminController> logger) : ControllerBase
{
    /// <summary>
    /// Wipes all runs and the entire game catalog, re-seeds the 15 hand-curated
    /// baseline games, then immediately runs the CheapShark sync so the Draft
    /// Room is fully populated when the request returns. Users are preserved.
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

        // On-demand ingestion so the catalog is live before this request returns
        // (takes a few seconds: two CheapShark calls spaced 1.5s apart).
        var syncResult = await gameSyncService.SyncAsync(cancellationToken);

        logger.LogWarning(
            "Hard reset complete: {Runs} runs, {Slots} slots, {Games} games deleted; baseline re-seeded and {Synced} CheapShark games ingested.",
            runsDeleted, slotsDeleted, gamesDeleted, syncResult.GamesAdded);

        return Ok(new
        {
            message = "Hard reset and CheapShark sync completed successfully. Baseline catalog re-seeded and live deals ingested.",
            runsDeleted,
            slotsDeleted,
            gamesDeleted,
            cheapSharkGamesProcessed = syncResult.GamesProcessed,
            cheapSharkGamesAdded = syncResult.GamesAdded
        });
    }
}
