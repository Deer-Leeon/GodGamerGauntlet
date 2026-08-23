using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UserController(IUserRepository userRepository) : ControllerBase
{
    [HttpPost]
    [ProducesResponseType(typeof(UserResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();

        var existing = await userRepository.GetByUsernameAsync(username, cancellationToken);
        if (existing is not null)
        {
            return Conflict($"Username '{username}' is already taken.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            CreatedAt = DateTime.UtcNow
        };

        await userRepository.AddAsync(user, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = user.Id }, UserResponse.FromEntity(user));
    }

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<UserResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var users = await userRepository.GetAllAsync(cancellationToken);
        return Ok(users.Select(UserResponse.FromEntity));
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
