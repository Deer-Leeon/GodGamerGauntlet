using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>
/// Synchronized run state for the OBS overlay and the streamer control deck.
/// Reads are public. Actions require either the owner's JWT (control deck) or
/// the run's overlay key passed as ?key= (the OBS browser source, which can't
/// log in).
/// </summary>
[ApiController]
[Route("api/runs/{id:guid}/overlay")]
public class OverlayController(AppDbContext context) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    [HttpGet]
    [ProducesResponseType(typeof(OverlayStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetState(Guid id, CancellationToken cancellationToken)
    {
        var run = await LoadRunAsync(id, cancellationToken);
        if (run is null)
        {
            return NotFound();
        }

        var isOwner = run.UserId == CurrentUserId;

        // Owners get the overlay key so the control deck can build the OBS URL.
        // Pre-Phase 8 runs don't have one yet; mint it on first owner read.
        if (isOwner && string.IsNullOrEmpty(run.OverlayKey))
        {
            run.OverlayKey = OverlayKeys.Create();
            await context.SaveChangesAsync(cancellationToken);
        }

        return Ok(ToDto(run, includeKey: isOwner));
    }

    [HttpPost("toggle")]
    [ProducesResponseType(typeof(OverlayStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> TogglePlayPause(
        Guid id, [FromQuery] string? key, CancellationToken cancellationToken)
    {
        var run = await LoadRunAsync(id, cancellationToken);
        if (run is null) return NotFound();
        if (!CanControl(run, key)) return Forbid();

        var now = DateTime.UtcNow;
        switch (run.TimerStatus)
        {
            case "running":
                run.TimerElapsedMs = ComputeElapsedMs(run, now);
                run.TimerStatus = "paused";
                run.TimerUpdatedAt = now;
                break;
            case "finished":
                // The gauntlet is over; reset is the only way back.
                break;
            default: // idle or paused
                run.TimerStatus = "running";
                run.TimerUpdatedAt = now;
                break;
        }

        await context.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(run, includeKey: run.UserId == CurrentUserId));
    }

    /// <summary>Marks the current game beaten, locks its split, and advances the wheel.</summary>
    [HttpPost("split")]
    [ProducesResponseType(typeof(OverlayStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Split(
        Guid id, [FromQuery] string? key, CancellationToken cancellationToken)
    {
        var run = await LoadRunAsync(id, cancellationToken);
        if (run is null) return NotFound();
        if (!CanControl(run, key)) return Forbid();

        if (run.Status != RunStatus.Active)
        {
            return BadRequest("Run is not active. Undo or reset first.");
        }

        var slots = run.Slots.OrderBy(s => s.Position).ToList();
        var current = slots.FirstOrDefault(s => s.Status != RunSlotStatus.Won);
        if (current is null)
        {
            return BadRequest($"All {slots.Count} games are already beaten.");
        }

        var now = DateTime.UtcNow;
        var elapsed = ComputeElapsedMs(run, now);

        current.Status = RunSlotStatus.Won;
        current.SplitTimeMs = elapsed;

        if (current.Position == slots.Max(s => s.Position))
        {
            // Final split: the gauntlet is conquered and the timer freezes.
            run.Status = RunStatus.Completed;
            run.EndTime = now;
            run.TimerStatus = "finished";
            run.TimerElapsedMs = elapsed;
            run.TimerUpdatedAt = now;
        }

        await context.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(run, includeKey: run.UserId == CurrentUserId));
    }

    /// <summary>Reverts the most recently reported slot back to pending.</summary>
    [HttpPost("undo")]
    [ProducesResponseType(typeof(OverlayStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UndoPrevious(
        Guid id, [FromQuery] string? key, CancellationToken cancellationToken)
    {
        var run = await LoadRunAsync(id, cancellationToken);
        if (run is null) return NotFound();
        if (!CanControl(run, key)) return Forbid();

        var last = run.Slots
            .OrderBy(s => s.Position)
            .LastOrDefault(s => s.Status != RunSlotStatus.Pending);
        if (last is null)
        {
            return BadRequest("Nothing to undo: no slot has been reported yet.");
        }

        last.Status = RunSlotStatus.Pending;
        last.SplitTimeMs = null;

        // Undoing the final split (or a tracker-reported loss) reopens the run.
        if (run.Status != RunStatus.Active)
        {
            run.Status = RunStatus.Active;
            run.EndTime = null;
        }
        if (run.TimerStatus == "finished")
        {
            run.TimerStatus = "paused";
            run.TimerUpdatedAt = DateTime.UtcNow;
        }

        await context.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(run, includeKey: run.UserId == CurrentUserId));
    }

    /// <summary>Zeroes the timer, clears all splits, and rotates the wheel back to slot 1.</summary>
    [HttpPost("reset")]
    [ProducesResponseType(typeof(OverlayStateDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ResetGauntlet(
        Guid id, [FromQuery] string? key, CancellationToken cancellationToken)
    {
        var run = await LoadRunAsync(id, cancellationToken);
        if (run is null) return NotFound();
        if (!CanControl(run, key)) return Forbid();

        foreach (var slot in run.Slots)
        {
            slot.Status = RunSlotStatus.Pending;
            slot.SplitTimeMs = null;
        }

        run.Status = RunStatus.Active;
        run.EndTime = null;
        run.TimerStatus = "idle";
        run.TimerElapsedMs = 0;
        run.TimerUpdatedAt = null;

        await context.SaveChangesAsync(cancellationToken);
        return Ok(ToDto(run, includeKey: run.UserId == CurrentUserId));
    }

    private bool CanControl(Run run, string? key) =>
        run.UserId == CurrentUserId || OverlayKeys.Matches(run.OverlayKey, key);

    private Task<Run?> LoadRunAsync(Guid id, CancellationToken cancellationToken) =>
        context.Runs
            .Include(r => r.User)
            .Include(r => r.Slots.OrderBy(s => s.Position))
            .ThenInclude(s => s.Game)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);

    private static long ComputeElapsedMs(Run run, DateTime now)
    {
        var elapsed = (double)run.TimerElapsedMs;
        if (run.TimerStatus == "running" && run.TimerUpdatedAt is DateTime since)
        {
            elapsed += Math.Max(0, (now - since).TotalMilliseconds);
        }
        return (long)elapsed;
    }

    private static OverlayStateDto ToDto(Run run, bool includeKey)
    {
        var slots = run.Slots.OrderBy(s => s.Position).ToList();
        var currentIndex = slots.FindIndex(s => s.Status != RunSlotStatus.Won);
        if (currentIndex < 0)
        {
            currentIndex = Math.Max(0, slots.Count - 1);
        }

        return new OverlayStateDto(
            run.Id,
            run.User?.Username ?? "unknown",
            run.Status.ToString(),
            run.RunType.ToString(),
            currentIndex,
            run.TimerStatus,
            ComputeElapsedMs(run, DateTime.UtcNow),
            slots.Select(s => new OverlaySlotDto(
                s.GameId,
                s.Position,
                s.Game?.Title ?? "Unknown game",
                s.Game?.Thumb,
                s.Game?.BaseDifficulty ?? 0,
                s.Status == RunSlotStatus.Won,
                s.SplitTimeMs)).ToList(),
            includeKey ? run.OverlayKey : null);
    }
}
