using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record InitializeRunRequest(
    [Required, MinLength(10), MaxLength(10)] List<Guid> GameIds);

public record ReportMatchRequest(
    [Range(1, 10)] int SlotPosition,
    [Required] string Result);

public record RunSlotResponse(
    Guid Id,
    Guid GameId,
    int Position,
    string Status,
    string Title,
    string? Thumb,
    int BaseDifficulty)
{
    public static RunSlotResponse FromEntity(RunSlot slot) =>
        new(
            slot.Id,
            slot.GameId,
            slot.Position,
            slot.Status.ToString(),
            slot.Game?.Title ?? "Unknown game",
            slot.Game?.Thumb,
            slot.Game?.BaseDifficulty ?? 0);
}

public record RunResponse(
    Guid Id,
    Guid UserId,
    string StreamerName,
    DateTime StartTime,
    DateTime? EndTime,
    string Status,
    double TotalDifficultyScore,
    IReadOnlyList<RunSlotResponse> Slots)
{
    public static RunResponse FromEntity(Run run, string? streamerName = null) =>
        new(
            run.Id,
            run.UserId,
            streamerName ?? run.User?.Username ?? "unknown",
            run.StartTime,
            run.EndTime,
            run.Status.ToString(),
            run.TotalDifficultyScore,
            run.Slots.OrderBy(s => s.Position).Select(RunSlotResponse.FromEntity).ToList());
}
