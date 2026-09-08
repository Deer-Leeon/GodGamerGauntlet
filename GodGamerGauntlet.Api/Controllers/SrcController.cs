using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/src")]
public class SrcController(
    AppDbContext context,
    SrcClaimService claims,
    SrcImportService importer,
    JwtTokenService tokens,
    ILogger<SrcController> logger) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>
    /// Prove ownership of a speedrun.com account with its API key (never stored)
    /// and take the reserved handle plus that runner's flagship PBs.
    /// </summary>
    [HttpPost("claim")]
    [Authorize]
    [ProducesResponseType(typeof(ClaimSrcResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Claim(ClaimSrcRequest request, CancellationToken cancellationToken)
    {
        if (CurrentUserId is not Guid userId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.ApiKey))
        {
            return BadRequest("Paste the speedrun.com API key from https://www.speedrun.com/api/auth.");
        }

        try
        {
            var result = await claims.ClaimWithApiKeyAsync(userId, request.ApiKey, cancellationToken);
            if (result is null)
            {
                return StatusCode(StatusCodes.Status403Forbidden, "That speedrun.com API key was rejected.");
            }

            var user = await context.Users
                .Include(u => u.StreamLinks)
                .FirstAsync(u => u.Id == userId, cancellationToken);
            var isMod = await context.GameModerators.AnyAsync(m => m.UserId == user.Id, cancellationToken);
            return Ok(new ClaimSrcResponse(
                tokens.CreateToken(user),
                AccountDto.FromEntity(user, isMod),
                result.SrcUserId,
                result.RunsImported,
                result.TookReservedHandle));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    [HttpPost("~/api/admin/src/import")]
    [Authorize]
    [ProducesResponseType(typeof(SrcImportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ImportBulk(CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(cancellationToken)) return Forbid();
        if (!importer.BulkEnabled)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Bulk import stays off until SrcImport:BulkEnabled is true (written commercial license).");
        }

        try
        {
            var result = await importer.ImportBulkAsync(cancellationToken);
            return Ok(ToResponse(result));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "SRC bulk import failed.");
            return Problem("SRC import failed.");
        }
    }

    [HttpPost("~/api/admin/src/import/{abbreviation}")]
    [Authorize]
    [ProducesResponseType(typeof(SrcImportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> ImportGame(string abbreviation, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(cancellationToken)) return Forbid();
        if (!importer.BulkEnabled)
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                "Bulk import stays off until SrcImport:BulkEnabled is true (written commercial license).");
        }

        try
        {
            var result = await importer.ImportGameAsync(abbreviation, cancellationToken);
            return Ok(ToResponse(result));
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, ex.Message);
        }
    }

    [HttpPost("~/api/admin/src/grant")]
    [Authorize]
    [ProducesResponseType(typeof(ClaimSrcResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Grant(AdminGrantSrcRequest request, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(cancellationToken)) return Forbid();

        var claimant = await context.Users
            .FirstOrDefaultAsync(u => u.Username.ToLower() == request.GggUsername.Trim().ToLower(), cancellationToken);
        if (claimant is null) return NotFound("GGG user not found.");

        Models.User? reserved = null;
        if (!string.IsNullOrWhiteSpace(request.SrcUserId))
        {
            reserved = await context.Users
                .FirstOrDefaultAsync(u => u.SrcUserId == request.SrcUserId.Trim(), cancellationToken);
        }
        else if (!string.IsNullOrWhiteSpace(request.ReservedUsername))
        {
            var key = request.ReservedUsername.Trim().ToLower();
            reserved = await context.Users
                .FirstOrDefaultAsync(u => u.Username.ToLower() == key, cancellationToken);
        }

        if (reserved is null) return NotFound("Reserved profile not found.");

        try
        {
            var result = await claims.AdminGrantAsync(claimant.Id, reserved, cancellationToken);
            var fresh = await context.Users
                .Include(u => u.StreamLinks)
                .FirstAsync(u => u.Id == claimant.Id, cancellationToken);
            return Ok(new ClaimSrcResponse(
                tokens.CreateToken(fresh),
                AccountDto.FromEntity(fresh),
                result.SrcUserId,
                result.RunsImported,
                result.TookReservedHandle));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ex.Message);
        }
    }

    private Task<bool> IsAdminAsync(CancellationToken cancellationToken) =>
        context.Users.AsNoTracking()
            .AnyAsync(u => u.Id == CurrentUserId && u.IsAdmin, cancellationToken);

    private static SrcImportResponse ToResponse(SrcImportResult result) =>
        new(result.Games, result.Categories, result.RunsUpserted, result.RunsSkipped, result.PlayersReserved, result.Notes);
}
