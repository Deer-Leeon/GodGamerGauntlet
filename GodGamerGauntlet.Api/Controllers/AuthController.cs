using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    IUserRepository userRepository,
    JwtTokenService tokenService,
    AppDbContext context) : ControllerBase
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

        return StatusCode(StatusCodes.Status201Created, await SignedInAsync(user, cancellationToken));
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

        return Ok(await SignedInAsync(user, cancellationToken));
    }

    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(AccountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var user = await userRepository.GetByIdAsync(CurrentUserId, cancellationToken);
        return user is null
            ? Unauthorized()
            : Ok(AccountDto.FromEntity(user, await IsModeratorAsync(user.Id, cancellationToken)));
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
        return Ok(await SignedInAsync(user, cancellationToken));
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
        return Ok(await SignedInAsync(user, cancellationToken));
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
        return Ok(await SignedInAsync(user, cancellationToken));
    }

    [HttpPut("stream-links")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangeStreamLinks(
        [FromBody] ChangeStreamLinksRequest? request,
        CancellationToken cancellationToken)
    {
        if (!StreamLinkRules.TryNormalize(request?.Links, out var links, out var error))
        {
            return BadRequest(error);
        }

        var user = await userRepository.GetByIdAsync(CurrentUserId, cancellationToken);
        if (user is null) return Unauthorized();

        await userRepository.ReplaceStreamLinksAsync(user.Id, links, cancellationToken);
        var saved = await userRepository.GetByIdAsync(user.Id, cancellationToken);
        return Ok(await SignedInAsync(saved ?? user, cancellationToken));
    }

    /// <summary>
    /// Profile appearance: avatar image URL (null/blank clears it). Stream
    /// URLs are managed by PUT api/auth/stream-links, not here.
    /// </summary>
    [HttpPut("~/api/users/me/profile")]
    [Authorize]
    [ProducesResponseType(typeof(AuthResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UpdateProfile(
        UpdateProfileRequest request, CancellationToken cancellationToken)
    {
        var avatarUrl = string.IsNullOrWhiteSpace(request.AvatarUrl)
            ? null
            : request.AvatarUrl.Trim();

        if (avatarUrl is not null)
        {
            if (avatarUrl.Length > Models.User.AvatarUrlMaxLength)
            {
                return BadRequest("Avatar URL is too long.");
            }
            // http(s) only: an <img src> renders this, so no javascript:/data:.
            if (!Uri.TryCreate(avatarUrl, UriKind.Absolute, out var uri)
                || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return BadRequest("Avatar URL must be a valid http(s) image link.");
            }
        }

        var user = await context.Users
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(u => u.Id == CurrentUserId, cancellationToken);
        if (user is null) return Unauthorized();

        user.AvatarUrl = avatarUrl;
        await context.SaveChangesAsync(cancellationToken);

        return Ok(await SignedInAsync(user, cancellationToken));
    }

    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // The mod-queue nav link needs to know about moderator grants up front.
    private Task<bool> IsModeratorAsync(Guid userId, CancellationToken cancellationToken) =>
        context.GameModerators.AsNoTracking()
            .AnyAsync(m => m.UserId == userId, cancellationToken);

    private async Task<AuthResponse> SignedInAsync(User user, CancellationToken cancellationToken) =>
        new(
            tokenService.CreateToken(user),
            AccountDto.FromEntity(user, await IsModeratorAsync(user.Id, cancellationToken)));

    private static bool PasswordMatches(User user, string password)
    {
        if (user.PasswordHash is null) return false;
        return PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, password)
            != PasswordVerificationResult.Failed;
    }
}
