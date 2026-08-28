using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>
/// The courtroom: per-game verification queues and verdicts. Every action
/// requires the caller to be a global admin or an assigned GameModerator
/// for the submission's game.
/// </summary>
[ApiController]
[Route("api/moderation")]
[Authorize]
public class ModerationController(AppDbContext context) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private Task<bool> IsAdminAsync(CancellationToken cancellationToken) =>
        context.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == CurrentUserId && u.IsAdmin, cancellationToken);

    private async Task<bool> CanModerateAsync(Guid gameId, CancellationToken cancellationToken) =>
        await IsAdminAsync(cancellationToken)
        || await context.GameModerators
            .AsNoTracking()
            .AnyAsync(m => m.GameId == gameId && m.UserId == CurrentUserId, cancellationToken);

    /// <summary>Pending submissions for every game the caller moderates, oldest first.</summary>
    [HttpGet("queue")]
    [ProducesResponseType(typeof(IEnumerable<ModerationQueueItemDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetQueue(CancellationToken cancellationToken)
    {
        var isAdmin = await IsAdminAsync(cancellationToken);

        var query = context.Submissions
            .AsNoTracking()
            .Where(s => s.Status == SubmissionStatus.Pending);

        if (!isAdmin)
        {
            var moderatedGameIds = context.GameModerators
                .Where(m => m.UserId == CurrentUserId)
                .Select(m => m.GameId);
            query = query.Where(s => moderatedGameIds.Contains(s.GameId));
        }

        var pending = await query
            .Include(s => s.Game)
            .Include(s => s.Category)
            .Include(s => s.Player)
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .OrderBy(s => s.SubmittedAt)
            .Take(200)
            .ToListAsync(cancellationToken);

        var items = pending.Select(s => new ModerationQueueItemDto(
            s.Id,
            s.GameId,
            s.Game?.Title ?? "unknown",
            s.Category?.Name ?? "unknown",
            s.PlayerId,
            s.Player?.Username ?? "unknown",
            s.Player?.CreatedAt ?? default,
            s.PrimaryTimeMs,
            s.VideoUrl,
            s.PlayedOn,
            s.IsEmulator,
            s.SubmittedAt,
            SubmissionsController.ToVariableDtos(s)));

        return Ok(items);
    }

    /// <summary>Verify or reject a pending submission. Verifying re-computes PB obsolescence.</summary>
    [HttpPost("~/api/submissions/{id:guid}/review")]
    [ProducesResponseType(typeof(SubmissionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Review(Guid id, ReviewRequest request, CancellationToken cancellationToken)
    {
        var verify = string.Equals(request.Action, "Verify", StringComparison.OrdinalIgnoreCase);
        var reject = string.Equals(request.Action, "Reject", StringComparison.OrdinalIgnoreCase);
        if (!verify && !reject)
        {
            return BadRequest("Action must be 'Verify' or 'Reject'.");
        }

        if (reject && string.IsNullOrWhiteSpace(request.RejectReason))
        {
            return BadRequest("A reject reason is required when rejecting a run.");
        }

        var submission = await context.Submissions
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        if (submission is null) return NotFound();

        if (!await CanModerateAsync(submission.GameId, cancellationToken))
        {
            return Forbid();
        }

        if (submission.Status != SubmissionStatus.Pending)
        {
            return BadRequest("This run has already been reviewed.");
        }

        submission.ExaminerId = CurrentUserId;
        submission.ReviewedAt = DateTime.UtcNow;

        if (reject)
        {
            submission.Status = SubmissionStatus.Rejected;
            submission.RejectReason = request.RejectReason!.Trim();
        }
        else
        {
            submission.Status = SubmissionStatus.Verified;
            await RecomputeObsolescenceAsync(submission, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);

        var dto = await context.Submissions
            .AsNoTracking()
            .Include(s => s.Game)
            .Include(s => s.Category)
            .Include(s => s.Player)
            .Include(s => s.Examiner)
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .FirstAsync(s => s.Id == id, cancellationToken);

        return Ok(SubmissionsController.ToDto(dto));
    }

    /// <summary>
    /// One player holds one live PB per board (category + subcategory value
    /// combination). All of the player's verified runs on the newly verified
    /// run's board are compared; only the fastest stays current, everything
    /// slower is flagged obsolete — including the new run if it does not beat
    /// the existing PB.
    /// </summary>
    private async Task RecomputeObsolescenceAsync(Submission verified, CancellationToken cancellationToken)
    {
        var boardKey = SubcategoryKey(verified);

        var rivals = await context.Submissions
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .Where(s =>
                s.PlayerId == verified.PlayerId
                && s.CategoryId == verified.CategoryId
                && s.Status == SubmissionStatus.Verified
                && s.Id != verified.Id)
            .ToListAsync(cancellationToken);

        var board = rivals
            .Where(s => SubcategoryKey(s).SetEquals(boardKey))
            .Append(verified)
            .OrderBy(s => s.PrimaryTimeMs)
            .ThenBy(s => s.SubmittedAt)
            .ToList();

        for (var i = 0; i < board.Count; i++)
        {
            board[i].IsObsolete = i > 0;
        }
    }

    private static HashSet<Guid> SubcategoryKey(Submission submission) =>
        submission.Variables
            .Where(x => x.VariableValue?.Variable?.IsSubcategory == true)
            .Select(x => x.VariableValueId)
            .ToHashSet();

    // ── Moderator assignment (global admin only) ─────────────────────────────

    [HttpGet("games/{gameId:guid}/moderators")]
    [ProducesResponseType(typeof(IEnumerable<ModeratorDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetModerators(Guid gameId, CancellationToken cancellationToken)
    {
        var moderators = await context.GameModerators
            .AsNoTracking()
            .Where(m => m.GameId == gameId)
            .Include(m => m.User)
            .OrderBy(m => m.AssignedAt)
            .Select(m => new ModeratorDto(m.UserId, m.User!.Username, m.AssignedAt))
            .ToListAsync(cancellationToken);

        return Ok(moderators);
    }

    [HttpPost("games/{gameId:guid}/moderators")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignModerator(
        Guid gameId, AssignModeratorRequest request, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(cancellationToken)) return Forbid();

        var gameExists = await context.Games.AnyAsync(g => g.Id == gameId, cancellationToken);
        if (!gameExists) return NotFound("Game not found.");

        var user = await context.Users
            .FirstOrDefaultAsync(u => u.Username == request.Username, cancellationToken);
        if (user is null) return NotFound("User not found.");

        var already = await context.GameModerators
            .AnyAsync(m => m.GameId == gameId && m.UserId == user.Id, cancellationToken);
        if (!already)
        {
            context.GameModerators.Add(new GameModerator
            {
                GameId = gameId,
                UserId = user.Id,
                AssignedAt = DateTimeOffset.UtcNow,
            });
            await context.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }

    [HttpDelete("games/{gameId:guid}/moderators/{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> RemoveModerator(Guid gameId, Guid userId, CancellationToken cancellationToken)
    {
        if (!await IsAdminAsync(cancellationToken)) return Forbid();

        await context.GameModerators
            .Where(m => m.GameId == gameId && m.UserId == userId)
            .ExecuteDeleteAsync(cancellationToken);

        return NoContent();
    }
}
