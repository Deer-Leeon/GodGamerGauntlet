using GodGamerGauntlet.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/admin")]
public class AdminController(
    AppDbContext context,
    ILogger<AdminController> logger) : ControllerBase
{
    /// <summary>
    /// Wipes all runs and the game catalog, then re-seeds the gauntlet roster.
    /// The catalog is ready the moment this returns — there is no ingest to wait
    /// on any more. Users are preserved.
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
            "Hard reset complete: {Runs} runs, {Slots} slots, {Games} games deleted; roster re-seeded.",
            runsDeleted, slotsDeleted, gamesDeleted);

        return Ok(new
        {
            message =
                $"Hard reset complete. Catalog re-seeded with the {GauntletRoster.Games.Count}-game gauntlet roster.",
            runsDeleted,
            slotsDeleted,
            gamesDeleted
        });
    }
}
