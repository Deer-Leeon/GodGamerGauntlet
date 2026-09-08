using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

/// <summary>
/// The exact slot count is validated against <see cref="RunType"/> in the
/// controller; the attributes only bound the request to the widest legal range.
/// </summary>
public record InitializeRunRequest(
    [Required, MinLength(RunTypes.MinLiveSlotCount), MaxLength(RunTypes.MaxLiveSlotCount)]
    List<Guid> GameIds,
    // "Sprint", "Marathon", or "Endurance"; defaults to Marathon when omitted.
    string? RunType = null);

public record ReportMatchRequest(
    [Range(1, RunTypes.StandardSlotCount)] int SlotPosition,
    [Required] string Result);

public record RunSlotResponse(
    Guid Id,
    Guid GameId,
    int Position,
    string Status,
    string Title,
    string? Thumb,
    int BaseDifficulty,
    long? SplitTimeMs)
{
    public static RunSlotResponse FromEntity(RunSlot slot) =>
        new(
            slot.Id,
            slot.GameId,
            slot.Position,
            slot.Status.ToString(),
            slot.Game?.Title ?? "Unknown game",
            slot.Game?.Thumb,
            slot.Game?.BaseDifficulty ?? 0,
            slot.SplitTimeMs);
}

public record RunResponse(
    Guid Id,
    Guid UserId,
    string StreamerName,
    DateTime StartTime,
    DateTime? EndTime,
    string Status,
    string RunType,
    // Games this run is made of: 10 for Standard, 5 for Lite.
    int TotalSlots,
    double TotalDifficultyScore,
    // Live overlay clock; 0 when the run never used the speedrun timer.
    long ElapsedMs,
    // idle | running | paused | finished — running clocks tick on the client.
    string TimerStatus,
    string? AttemptCode,
    IReadOnlyList<RunSlotResponse> Slots,
    IReadOnlyList<StreamLinkDto> StreamLinks)
{
    public static RunResponse FromEntity(Run run, string? streamerName = null)
    {
        var now = DateTime.UtcNow;
        return new(
            run.Id,
            run.UserId,
            streamerName ?? run.User?.Username ?? "unknown",
            run.StartTime,
            run.EndTime,
            run.Status.ToString(),
            run.RunType.ToString(),
            run.RunType.SlotCount(),
            run.TotalDifficultyScore,
            run.CurrentElapsedMs(now),
            run.TimerStatus,
            run.AttemptCode,
            run.Slots.OrderBy(s => s.Position).Select(RunSlotResponse.FromEntity).ToList(),
            StreamLinkDto.FromUser(run.User));
    }
}
