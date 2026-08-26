using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    IUserRepository userRepository,
    JwtTokenService tokenService) : ControllerBase
{
    private static readonly PasswordHasher<User> PasswordHasher = new();

    [HttpPost("register")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (!AccountRules.TryNormalizeUsername(request.Username, out var username, out var usernameError))
        {
            return BadRequest(usernameError);
        }

        if (!AccountRules.TryNormalizeEmail(request.Email, out var email, out var emailError))
        {
            return BadRequest(emailError);
        }

        if (await userRepository.GetByUsernameAsync(username, cancellationToken) is not null)
        {
            return Conflict($"Username '{username}' is already taken.");
        }

        if (await userRepository.GetByEmailAsync(email, cancellationToken) is not null)
        {
            return Conflict("That email is already in use.");
        }

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            Email = email,
            CreatedAt = DateTime.UtcNow
        };
        user.PasswordHash = PasswordHasher.HashPassword(user, request.Password);

        await userRepository.AddAsync(user, cancellationToken);

        return StatusCode(StatusCodes.Status201Created, SignedIn(user));
    }

    [HttpPost("login")]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByLoginAsync(request.Username, cancellationToken);

        // Legacy pre-auth accounts have no hash and cannot log in.
        if (user?.PasswordHash is null)
        {
            return Unauthorized("Invalid username, email, or password.");
        }

        var result = PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            return Unauthorized("Invalid username, email, or password.");
        }

        return Ok(SignedIn(user));
    }

    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(AccountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(CurrentUserId, cancellationToken);
        return user is null ? Unauthorized() : Ok(AccountDto.FromEntity(user));
    }

    [HttpPut("username")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeUsername(
        ChangeUsernameRequest request,
        CancellationToken cancellationToken)
    {
        if (!AccountRules.TryNormalizeUsername(request.Username, out var username, out var error))
        {
            return BadRequest(error);
        }

        var user = await userRepository.GetForUpdateAsync(CurrentUserId, cancellationToken);
        if (user is null) return Unauthorized();

        var taken = await userRepository.GetByUsernameAsync(username, cancellationToken);
        if (taken is not null && taken.Id != user.Id)
        {
            return Conflict($"Username '{username}' is already taken.");
        }

        user.Username = username;
        await userRepository.SaveChangesAsync(cancellationToken);
        return Ok(SignedIn(user));
    }

    [HttpPut("email")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeEmail(
        ChangeEmailRequest request,
        CancellationToken cancellationToken)
    {
        if (!AccountRules.TryNormalizeEmail(request.Email, out var email, out var error))
        {
            return BadRequest(error);
        }

        var user = await userRepository.GetForUpdateAsync(CurrentUserId, cancellationToken);
        if (user is null) return Unauthorized();
        if (!PasswordMatches(user, request.CurrentPassword))
        {
            return Unauthorized("Current password is incorrect.");
        }

        var taken = await userRepository.GetByEmailAsync(email, cancellationToken);
        if (taken is not null && taken.Id != user.Id)
        {
            return Conflict("That email is already in use.");
        }

        user.Email = email;
        await userRepository.SaveChangesAsync(cancellationToken);
        return Ok(SignedIn(user));
    }

    [HttpPut("password")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var user = await userRepository.GetForUpdateAsync(CurrentUserId, cancellationToken);
        if (user is null) return Unauthorized();
        if (!PasswordMatches(user, request.CurrentPassword))
        {
            return Unauthorized("Current password is incorrect.");
        }

        user.PasswordHash = PasswordHasher.HashPassword(user, request.NewPassword);
        await userRepository.SaveChangesAsync(cancellationToken);
        return Ok(SignedIn(user));
    }

    [HttpPut("stream-links")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangeStreamLinks(
        [FromBody] ChangeStreamLinksRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            if (!StreamLinkRules.TryNormalize(request?.Links, out var links, out var error))
            {
                return BadRequest(error);
            }

            var user = await userRepository.GetForUpdateAsync(CurrentUserId, cancellationToken);
            if (user is null) return Unauthorized();

            user.StreamLinks ??= new List<UserStreamLink>();
            user.StreamLinks.Clear();
            for (var i = 0; i < links.Count; i++)
            {
                user.StreamLinks.Add(new UserStreamLink
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    Platform = links[i].Platform,
                    Url = links[i].Url,
                    SortOrder = i,
                });
            }

            await userRepository.SaveChangesAsync(cancellationToken);
            return Ok(SignedIn(user));
        }
        catch (Exception ex)
        {
            return BadRequest(ex.GetBaseException().Message);
        }
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private AuthResponse SignedIn(User user) =>
        new(tokenService.CreateToken(user), AccountDto.FromEntity(user));

    private static bool PasswordMatches(User user, string password)
    {
        if (user.PasswordHash is null) return false;
        return PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, password)
            != PasswordVerificationResult.Failed;
    }
}
