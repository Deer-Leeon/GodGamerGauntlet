using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(IRecordBook recordBook) : ControllerBase
{
    /// <param name="runType">Sprint, Marathon, Endurance, or legacy Standard/Lite. Defaults to Marathon.</param>
    /// <param name="limit">How many PBs to return (1–50, default 50).</param>
    /// <param name="season">"all" (default), "current", or "yyyy-MM".</param>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<LeaderboardEntryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Get(
        [FromQuery] string? runType,
        [FromQuery] int limit = 50,
        [FromQuery] string? season = "all",
        CancellationToken cancellationToken = default)
    {
        if (!RunTypes.TryParse(runType, out var type))
        {
            return BadRequest(
                "runType must be 'Sprint', 'Marathon', 'Endurance', 'Standard', or 'Lite'.");
        }

        if (!Seasons.TryRange(season, out _, out _))
        {
            return BadRequest("season must be 'all', 'current', or 'yyyy-MM'.");
        }

        var entries = await recordBook.GetBoardAsync(type, limit, cancellationToken, season);
        return Ok(entries);
    }

    [HttpGet("survival")]
    [ProducesResponseType(typeof(IEnumerable<LeaderboardEntryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetSurvival(
        [FromQuery] string? runType,
        [FromQuery] int limit = 50,
        CancellationToken cancellationToken = default)
    {
        if (!RunTypes.TryParse(runType, out var type))
        {
            return BadRequest(
                "runType must be 'Sprint', 'Marathon', 'Endurance', 'Standard', or 'Lite'.");
        }

        var entries = await recordBook.GetSurvivalBoardAsync(type, limit, cancellationToken);
        return Ok(entries);
    }

    [HttpGet("seasons")]
    [ProducesResponseType(typeof(IEnumerable<SeasonChampionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSeasons(CancellationToken cancellationToken)
    {
        var hof = await recordBook.GetHallOfFameAsync(cancellationToken);
        return Ok(hof);
    }
}
