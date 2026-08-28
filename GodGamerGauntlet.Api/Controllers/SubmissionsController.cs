using System.Security.Claims;
using System.Text.RegularExpressions;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/submissions")]
public partial class SubmissionsController(AppDbContext context) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    // Proof must be a Twitch or YouTube link — examiners need a VOD to watch.
    [GeneratedRegex(
        @"^https://(www\.|m\.)?(youtube\.com/(watch\?|live/|shorts/)|youtu\.be/|twitch\.tv/(videos/\d+|\w+/(v|video)/\d+|\w+/clip/)|clips\.twitch\.tv/)\S+$",
        RegexOptions.IgnoreCase)]
    private static partial Regex VideoUrlRegex();

    [HttpPost]
    [Authorize]
    [ProducesResponseType(typeof(SubmissionDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Submit(SubmitRunRequest request, CancellationToken cancellationToken)
    {
        if (!VideoUrlRegex().IsMatch(request.VideoUrl))
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
            ToVariableDtos(submission));

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
