using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/runs")]
public class RunController(IRunRepository runRepository, IGameRepository gameRepository, IRecordBook recordBook) : ControllerBase
{
    private Guid CurrentUserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpPost("initialize")]
    [Authorize]
    [ProducesResponseType(typeof(RunResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Initialize(InitializeRunRequest request, CancellationToken cancellationToken)
    {
        if (!RunTypes.TryParse(request.RunType, out var runType))
        {
            return BadRequest("runType must be 'Standard' or 'Lite'.");
        }

        var requiredSlotCount = runType.SlotCount();
        if (request.GameIds.Count != requiredSlotCount)
        {
            return BadRequest(
                $"A {runType} gauntlet needs exactly {requiredSlotCount} game ids, ordered by slot position.");
        }

        var userId = CurrentUserId;
        if (!await runRepository.UserExistsAsync(userId, cancellationToken))
        {
            return BadRequest("The authenticated user no longer exists.");
        }

        var games = await gameRepository.GetByIdsAsync(request.GameIds, cancellationToken);
        var gamesById = games.ToDictionary(g => g.Id);

        var missingIds = request.GameIds.Where(id => !gamesById.ContainsKey(id)).Distinct().ToList();
        if (missingIds.Count > 0)
        {
            return BadRequest($"Unknown game ids: {string.Join(", ", missingIds)}.");
        }

        var run = new Run
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            StartTime = DateTime.UtcNow,
            Status = RunStatus.Active,
            RunType = runType,
            OverlayKey = Services.OverlayKeys.Create()
        };

        double totalDifficultyScore = 0;

        for (var index = 0; index < request.GameIds.Count; index++)
        {
            var position = index + 1;
            var game = gamesById[request.GameIds[index]];

            totalDifficultyScore += SlotScores.ForSlot(game.BaseDifficulty, position);

            run.Slots.Add(new RunSlot
            {
                Id = Guid.NewGuid(),
                RunId = run.Id,
                GameId = game.Id,
                Position = position,
                Status = RunSlotStatus.Pending
            });
        }

        run.TotalDifficultyScore = totalDifficultyScore;

        await runRepository.AddAsync(run, cancellationToken);

        // Populate game navigations only after saving: the games were loaded
        // without tracking, and attaching them before Add() would make EF try
        // to re-insert them. Here they only feed the response DTO.
        foreach (var slot in run.Slots)
        {
            slot.Game = gamesById[slot.GameId];
        }

        return CreatedAtAction(
            nameof(GetById),
            new { id = run.Id },
            RunResponse.FromEntity(run, User.FindFirstValue(ClaimTypes.Name)));
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(RunResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var run = await runRepository.GetByIdAsync(id, cancellationToken);
        return run is null ? NotFound() : Ok(RunResponse.FromEntity(run));
    }

    [HttpGet("{id:guid}/placement")]
    [ProducesResponseType(typeof(RunPlacementDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPlacement(Guid id, CancellationToken cancellationToken)
    {
        var placement = await recordBook.GetPlacementAsync(id, cancellationToken);
        return placement is null ? NotFound() : Ok(placement);
    }

    [HttpPost("{id:guid}/report")]
    [Authorize]
    [ProducesResponseType(typeof(RunResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Report(Guid id, ReportMatchRequest request, CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<RunSlotStatus>(request.Result, ignoreCase: true, out var result)
            || result == RunSlotStatus.Pending)
        {
            return BadRequest("result must be 'Won' or 'Lost'.");
        }

        var run = await runRepository.GetByIdTrackedAsync(id, cancellationToken);
        if (run is null)
        {
            return NotFound();
        }

        // Only the streamer who owns the run can report its results.
        if (run.UserId != CurrentUserId)
        {
            return Forbid();
        }

        if (run.Status != RunStatus.Active)
        {
            return BadRequest("Run is not currently active.");
        }

        var slots = run.Slots.OrderBy(s => s.Position).ToList();

        var target = slots.FirstOrDefault(s => s.Position == request.SlotPosition);
        if (target is null)
        {
            return BadRequest($"Slot at position {request.SlotPosition} does not exist on this run.");
        }

        if (target.Status != RunSlotStatus.Pending)
        {
            return BadRequest($"Slot {request.SlotPosition} has already been reported as {target.Status}.");
        }

        if (slots.Any(s => s.Position < request.SlotPosition && s.Status != RunSlotStatus.Won))
        {
            return BadRequest(
                $"Slot {request.SlotPosition} cannot be reported yet: all preceding slots must be won first.");
        }

        target.Status = result;

        if (result == RunSlotStatus.Lost)
        {
            run.Status = RunStatus.Failed;
            run.EndTime = DateTime.UtcNow;
        }
        else if (request.SlotPosition == run.RunType.SlotCount())
        {
            run.Status = RunStatus.Completed;
            run.EndTime = DateTime.UtcNow;
        }

        await runRepository.SaveChangesAsync(cancellationToken);

        return Ok(RunResponse.FromEntity(run));
    }
}
