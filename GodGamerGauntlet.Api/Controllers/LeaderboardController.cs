using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(IRecordBook recordBook) : ControllerBase
{
    /// <param name="runType">"Standard" or "Lite". Defaults to Standard.</param>
    /// <param name="limit">How many PBs to return (1–50, default 50).</param>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<LeaderboardEntryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Get(
        [FromQuery] string? runType,
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        if (!RunTypes.TryParse(runType, out var type))
        {
            return BadRequest("runType must be 'Standard' or 'Lite'.");
        }

        var entries = await recordBook.GetBoardAsync(type, limit, cancellationToken);
        return Ok(entries);
    }
}
