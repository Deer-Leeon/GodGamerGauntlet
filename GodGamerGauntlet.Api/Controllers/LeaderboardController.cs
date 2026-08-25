using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(IRunRepository runRepository) : ControllerBase
{
    private const int LeaderboardSize = 50;

    /// <param name="runType">"Standard" or "Lite". Defaults to Standard.</param>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<LeaderboardEntryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Get(
        [FromQuery] string? runType,
        CancellationToken cancellationToken)
    {
        if (!RunTypes.TryParse(runType, out var type))
        {
            return BadRequest("runType must be 'Standard' or 'Lite'.");
        }

        var entries = await runRepository.GetLeaderboardAsync(type, LeaderboardSize, cancellationToken);
        return Ok(entries);
    }
}
