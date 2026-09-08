using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>Public, read-only views of the verified speedrun ledger.</summary>
[ApiController]
[Route("api/games/{gameId:guid}")]
public class RecordsController(AppDbContext context) : ControllerBase
{
    /// <summary>Game header + categories + variables + moderators for the records page.</summary>
    [HttpGet("records")]
    [ProducesResponseType(typeof(GameRecordsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetGameRecords(Guid gameId, CancellationToken cancellationToken)
    {
        var game = await context.Games
            .AsNoTracking()
            .FirstOrDefaultAsync(g => g.Id == gameId, cancellationToken);
        if (game is null) return NotFound();

        var categories = await context.Categories
            .AsNoTracking()
            .Where(c => c.GameId == gameId)
            .Include(c => c.Variables)
            .ThenInclude(v => v.Values)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(cancellationToken);

        var moderators = await context.GameModerators
            .AsNoTracking()
            .Where(m => m.GameId == gameId)
            .Include(m => m.User)
            // Username, not AssignedAt: SQLite (tests) can't ORDER BY DateTimeOffset.
            .OrderBy(m => m.User!.Username)
            .Select(m => new ModeratorDto(m.UserId, m.User!.Username, m.AssignedAt))
            .ToListAsync(cancellationToken);

        var srcLink = await context.GameSrcLinks
            .AsNoTracking()
            .FirstOrDefaultAsync(l => l.GameId == gameId, cancellationToken);

        var dto = new GameRecordsDto(
            game.Id,
            game.Title,
            game.Thumb,
            categories.Select(c => new RecordsCategoryDto(
                c.Id,
                c.Name,
                c.Rules,
                c.Variables
                    .OrderBy(v => v.Name)
                    .Select(v => new RecordsVariableDto(
                        v.Id,
                        v.Name,
                        v.IsSubcategory,
                        v.IsRequired,
                        v.Values
                            .OrderBy(x => x.Value)
                            .Select(x => new RecordsValueDto(x.Id, x.Value))
                            .ToList()))
                    .ToList()))
                .ToList(),
            moderators,
            srcLink?.SrcWeblink);

        return Ok(dto);
    }

    /// <summary>
    /// The verified board: current (non-obsolete) runs, fastest first, one row
    /// per player. Optional ?values= (comma-separated VariableValue ids) narrows
    /// to runs carrying every listed value — subcategory pills on the UI.
    /// </summary>
    [HttpGet("categories/{categoryId:guid}/leaderboard")]
    [ProducesResponseType(typeof(IEnumerable<RecordRowDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetLeaderboard(
        Guid gameId,
        Guid categoryId,
        [FromQuery] string? values,
        CancellationToken cancellationToken)
    {
        var categoryExists = await context.Categories
            .AnyAsync(c => c.Id == categoryId && c.GameId == gameId, cancellationToken);
        if (!categoryExists) return NotFound();

        var filterIds = (values ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(raw => Guid.TryParse(raw, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();

        var query = context.Submissions
            .AsNoTracking()
            .Where(s =>
                s.CategoryId == categoryId
                && s.Status == SubmissionStatus.Verified
                && !s.IsObsolete);

        foreach (var valueId in filterIds)
        {
            query = query.Where(s => s.Variables.Any(x => x.VariableValueId == valueId));
        }

        var runs = await query
            .Include(s => s.Player)
            .Include(s => s.Examiner)
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .OrderBy(s => s.PrimaryTimeMs)
            .ThenBy(s => s.SubmittedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        // Merged views (no subcategory pill selected) can surface a player's
        // PB from several boards; a leaderboard shows each player once.
        var rows = runs
            .GroupBy(s => s.PlayerId)
            .Select(g => g.First())
            .OrderBy(s => s.PrimaryTimeMs)
            .ThenBy(s => s.SubmittedAt)
            .Select((s, index) => new RecordRowDto(
                index + 1,
                s.Id,
                s.PlayerId,
                SrcUsernames.PublicName(s.Player),
                s.PrimaryTimeMs,
                s.PlayedOn,
                s.IsEmulator,
                s.VideoUrl,
                s.Examiner?.Username,
                SubmissionsController.ToVariableDtos(s),
                s.Origin.ToString(),
                string.IsNullOrWhiteSpace(s.SrcRunId) ? null : SrcUsernames.RunWeblink(s.SrcRunId),
                s.Player?.IsReserved == true,
                s.Player?.Username ?? "unknown"))
            .ToList();

        return Ok(rows);
    }
}
