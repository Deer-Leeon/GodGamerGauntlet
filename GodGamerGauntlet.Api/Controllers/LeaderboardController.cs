using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/leaderboard")]
public class LeaderboardController(IRunRepository runRepository) : ControllerBase
{
    private const int LeaderboardSize = 50;

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<LeaderboardEntryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var entries = await runRepository.GetLeaderboardAsync(LeaderboardSize, cancellationToken);
        return Ok(entries);
    }
}
