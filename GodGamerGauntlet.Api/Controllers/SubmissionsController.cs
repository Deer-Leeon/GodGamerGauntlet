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
[Route("api/submissions")]
public class SubmissionsController(AppDbContext context) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    [HttpPost]
    [Authorize]
    [ProducesResponseType(typeof(SubmissionDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Submit(SubmitRunRequest request, CancellationToken cancellationToken)
    {
        if (!ProofUrls.IsAccepted(request.VideoUrl))
        {
            return BadRequest("VideoUrl must be a YouTube or Twitch video/clip link (https).");
        }

        if (request.PlayedOn > DateTimeOffset.UtcNow.AddHours(1))
        {
            return BadRequest("PlayedOn cannot be in the future.");
        }

        var category = await context.Categories
            .AsNoTracking()
            .Include(c => c.Variables)
            .ThenInclude(v => v.Values)
            .FirstOrDefaultAsync(c => c.Id == request.CategoryId, cancellationToken);

        if (category is null || category.GameId != request.GameId)
        {
            return BadRequest("Category not found for that game.");
        }

        var selectedIds = (request.VariableValueIds ?? []).Distinct().ToList();
        var valueLookup = category.Variables
            .SelectMany(v => v.Values.Select(x => (Variable: v, Value: x)))
            .ToDictionary(p => p.Value.Id);

        foreach (var id in selectedIds)
        {
            if (!valueLookup.ContainsKey(id))
            {
                return BadRequest("A selected variable value does not belong to this category.");
            }
        }

        var perVariable = selectedIds
            .GroupBy(id => valueLookup[id].Variable.Id)
            .ToDictionary(g => g.Key, g => g.Count());

        if (perVariable.Values.Any(count => count > 1))
        {
            return BadRequest("Pick at most one value per variable.");
        }

        var missing = category.Variables
            .Where(v => v.IsRequired && !perVariable.ContainsKey(v.Id))
            .Select(v => v.Name)
            .ToList();

        if (missing.Count > 0)
        {
            return BadRequest($"Missing required variable(s): {string.Join(", ", missing)}.");
        }

        var submission = new Submission
        {
            Id = Guid.NewGuid(),
            GameId = request.GameId,
            CategoryId = request.CategoryId,
            PlayerId = CurrentUserId!.Value,
            PrimaryTimeMs = request.PrimaryTimeMs,
            VideoUrl = request.VideoUrl,
            PlayedOn = request.PlayedOn,
            IsEmulator = request.IsEmulator,
            Status = SubmissionStatus.Pending,
            SubmittedAt = DateTime.UtcNow,
            Variables = selectedIds
                .Select(id => new SubmissionVariable { VariableValueId = id })
                .ToList(),
        };

        context.Submissions.Add(submission);
        await context.SaveChangesAsync(cancellationToken);

        var dto = await LoadDtoAsync(submission.Id, cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = submission.Id }, dto);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(SubmissionDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var dto = await LoadDtoAsync(id, cancellationToken);
        return dto is null ? NotFound() : Ok(dto);
    }

    /// <summary>
    /// A player's current verified PBs for the public profile trophy room.
    /// Pending, rejected, and obsoleted runs never appear here.
    /// </summary>
    [HttpGet("~/api/users/by-username/{username}/speedruns")]
    [ProducesResponseType(typeof(IEnumerable<SubmissionDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPlayerSpeedruns(string username, CancellationToken cancellationToken)
    {
        var player = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (player is null) return NotFound();

        var runs = await QueryFullSubmissions()
            .Where(s =>
                s.PlayerId == player.Id
                && s.Status == SubmissionStatus.Verified
                && !s.IsObsolete)
            // Most recently verified first. (ReviewedAt is DateTime; PlayedOn
            // is a DateTimeOffset, which SQLite cannot ORDER BY.)
            .OrderByDescending(s => s.ReviewedAt)
            .Take(200)
            .ToListAsync(cancellationToken);

        return Ok(runs.Select(ToDto));
    }

    /// <summary>
    /// The caller's runs still in (or bounced from) the courtroom: pending
    /// submissions plus rejections with the examiner's reason.
    /// </summary>
    [HttpGet("~/api/users/me/pending-runs")]
    [Authorize]
    [ProducesResponseType(typeof(IEnumerable<SubmissionDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMyPendingRuns(CancellationToken cancellationToken)
    {
        var runs = await QueryFullSubmissions()
            .Where(s =>
                s.PlayerId == CurrentUserId
                && (s.Status == SubmissionStatus.Pending || s.Status == SubmissionStatus.Rejected))
            .OrderByDescending(s => s.SubmittedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

        return Ok(runs.Select(ToDto));
    }

    private IQueryable<Submission> QueryFullSubmissions() =>
        context.Submissions
            .AsNoTracking()
            .Include(s => s.Game)
            .Include(s => s.Category)
            .Include(s => s.Player)
            .Include(s => s.Examiner)
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable);

    private async Task<SubmissionDto?> LoadDtoAsync(Guid id, CancellationToken cancellationToken)
    {
        var submission = await context.Submissions
            .AsNoTracking()
            .Include(s => s.Game)
            .Include(s => s.Category)
            .Include(s => s.Player)
            .Include(s => s.Examiner)
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);

        return submission is null ? null : ToDto(submission);
    }

    internal static SubmissionDto ToDto(Submission submission) =>
        new(
            submission.Id,
            submission.GameId,
            submission.Game?.Title ?? "unknown",
            submission.CategoryId,
            submission.Category?.Name ?? "unknown",
            submission.PlayerId,
            submission.Player?.Username ?? "unknown",
            submission.PrimaryTimeMs,
            submission.VideoUrl,
            submission.PlayedOn,
            submission.IsEmulator,
            submission.Status.ToString(),
            submission.IsObsolete,
            submission.SubmittedAt,
            submission.ReviewedAt,
            submission.Examiner?.Username,
            submission.RejectReason,
            ToVariableDtos(submission),
            submission.Origin.ToString(),
            string.IsNullOrWhiteSpace(submission.SrcRunId)
                ? null
                : SrcUsernames.RunWeblink(submission.SrcRunId));

    internal static IReadOnlyList<SubmissionVariableDto> ToVariableDtos(Submission submission) =>
        submission.Variables
            .Where(x => x.VariableValue?.Variable is not null)
            .Select(x => new SubmissionVariableDto(
                x.VariableValueId,
                x.VariableValue!.Variable!.Name,
                x.VariableValue.Value,
                x.VariableValue.Variable.IsSubcategory))
            .OrderBy(x => x.VariableName)
            .ToList();
}
