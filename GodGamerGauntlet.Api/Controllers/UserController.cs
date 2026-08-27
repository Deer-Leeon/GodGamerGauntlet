using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UserController(IUserRepository userRepository, IRecordBook recordBook) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

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
        var profile = await recordBook.GetProfileAsync(username, CurrentUserId, cancellationToken);
        return profile is null ? NotFound() : Ok(profile);
    }

    [HttpPost("by-username/{username}/follow")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Follow(string username, CancellationToken cancellationToken)
    {
        var target = await userRepository.GetByUsernameAsync(username, cancellationToken);
        if (target is null) return NotFound();
        if (target.Id == CurrentUserId) return BadRequest("You can't follow yourself.");
        await userRepository.FollowAsync(CurrentUserId!.Value, target.Id, cancellationToken);
        return NoContent();
    }

    [HttpDelete("by-username/{username}/follow")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Unfollow(string username, CancellationToken cancellationToken)
    {
        var target = await userRepository.GetByUsernameAsync(username, cancellationToken);
        if (target is null) return NotFound();
        await userRepository.UnfollowAsync(CurrentUserId!.Value, target.Id, cancellationToken);
        return NoContent();
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

