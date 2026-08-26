using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

// Account creation moved to POST /api/auth/register (Phase 7) — a password-less
// create endpoint would let anyone squat usernames.
[ApiController]
[Route("api/users")]
public class UserController(IUserRepository userRepository, IRecordBook recordBook) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<PlayerCardDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var players = await recordBook.GetDirectoryAsync(cancellationToken);
        return Ok(players);
    }

    [HttpGet("by-username/{username}")]
    [ProducesResponseType(typeof(UserProfileDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetProfile(string username, CancellationToken cancellationToken)
    {
        var profile = await recordBook.GetProfileAsync(username, cancellationToken);
        return profile is null ? NotFound() : Ok(profile);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(id, cancellationToken);
        return user is null ? NotFound() : Ok(UserResponse.FromEntity(user));
    }
}
