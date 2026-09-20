using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>Per-game skip/glitch vault. Knowledge, not a records board.</summary>
[ApiController]
[Route("api/games/{gameId:guid}/tech")]
public class GameTechController(AppDbContext context) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<GameTechCardDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(Guid gameId, CancellationToken cancellationToken)
    {
        var exists = await context.Games
            .AsNoTracking()
            .AnyAsync(g => g.Id == gameId, cancellationToken);
        if (!exists) return NotFound();

        var rows = await context.GameTeches
            .AsNoTracking()
            .Where(t => t.GameId == gameId && t.Status != GameTechStatus.Draft)
            .Include(t => t.Clips)
            .Include(t => t.Votes)
            .OrderBy(t => t.Kind)
            .ThenBy(t => t.Title)
            .ToListAsync(cancellationToken);

        var viewerId = CurrentUserId;
        return Ok(rows.Select(t => ToCard(t, viewerId)).ToList());
    }

    [HttpPut("{techId:guid}/vote")]
    [Authorize]
    [ProducesResponseType(typeof(VoteResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Vote(
        Guid gameId,
        Guid techId,
        VoteRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Value is not (-1 or 0 or 1))
        {
            return BadRequest("value must be -1, 0, or 1.");
        }

        var userId = CurrentUserId!.Value;
        var tech = await context.GameTeches
            .Include(t => t.Votes)
            .FirstOrDefaultAsync(
                t => t.Id == techId && t.GameId == gameId && t.Status != GameTechStatus.Draft,
                cancellationToken);
        if (tech is null) return NotFound();

        var existing = tech.Votes.FirstOrDefault(v => v.UserId == userId);
        if (request.Value == 0)
        {
            if (existing is not null) context.GameTechVotes.Remove(existing);
        }
        else if (existing is null)
        {
            context.GameTechVotes.Add(new GameTechVote
            {
                Id = Guid.NewGuid(),
                TechId = tech.Id,
                UserId = userId,
                Value = request.Value,
                CreatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            existing.Value = request.Value;
        }

        await context.SaveChangesAsync(cancellationToken);

        var score = await context.GameTechVotes
            .Where(v => v.TechId == tech.Id)
            .SumAsync(v => (int?)v.Value, cancellationToken) ?? 0;
        var mine = request.Value;
        if (request.Value == 0) mine = 0;
        return Ok(new VoteResponse(score, mine));
    }

    [HttpPost("{techId:guid}/reports")]
    [Authorize]
    [ProducesResponseType(typeof(GameTechReportResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Report(
        Guid gameId,
        Guid techId,
        GameTechReportRequest request,
        CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<GameTechReportKind>(request.Kind, ignoreCase: true, out var kind)
            || !Enum.IsDefined(kind))
        {
            return BadRequest("kind must be Patched, Broken, or Unsafe.");
        }

        var note = request.Note?.Trim();
        if (note is { Length: > GameTechReport.NoteMaxLength })
        {
            return BadRequest($"Note must be at most {GameTechReport.NoteMaxLength} characters.");
        }

        var exists = await context.GameTeches.AnyAsync(
            t => t.Id == techId && t.GameId == gameId && t.Status != GameTechStatus.Draft,
            cancellationToken);
        if (!exists) return NotFound();

        var row = new GameTechReport
        {
            Id = Guid.NewGuid(),
            TechId = techId,
            UserId = CurrentUserId!.Value,
            Kind = kind,
            Note = string.IsNullOrWhiteSpace(note) ? null : note,
            Status = GameTechReportStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        };
        context.GameTechReports.Add(row);
        await context.SaveChangesAsync(cancellationToken);
        return Ok(new GameTechReportResponse(row.Id, row.Kind.ToString(), row.Status.ToString()));
    }

    private static GameTechCardDto ToCard(GameTech tech, Guid? viewerId)
    {
        var score = tech.Votes.Sum(v => v.Value);
        var mine = viewerId is Guid id
            ? tech.Votes.FirstOrDefault(v => v.UserId == id)?.Value ?? 0
            : 0;
        var clips = tech.Clips
            .OrderBy(c => c.SortOrder)
            .Select(c => new GameTechClipDto(c.Provider.ToString(), c.Url, c.StartSeconds))
            .ToList();
        return new GameTechCardDto(
            tech.Id,
            tech.Slug,
            tech.Title,
            tech.Kind.ToString(),
            tech.Difficulty.ToString(),
            tech.PatchScope.ToString(),
            tech.VersionNote,
            tech.Summary,
            tech.BodyMarkdown,
            tech.Prerequisites,
            tech.Loadout,
            tech.Status.ToString(),
            score,
            mine,
            clips);
    }
}
