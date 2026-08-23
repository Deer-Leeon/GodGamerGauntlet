using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record InitializeRunRequest(
    [Required] Guid UserId,
    [Required, MinLength(10), MaxLength(10)] List<Guid> GameIds);

public record ReportMatchRequest(
    [Range(1, 10)] int SlotPosition,
    [Required] string Result);

public record RunSlotResponse(Guid Id, Guid GameId, int Position, string Status)
{
    public static RunSlotResponse FromEntity(RunSlot slot) =>
        new(slot.Id, slot.GameId, slot.Position, slot.Status.ToString());
}

public record RunResponse(
    Guid Id,
    Guid UserId,
    DateTime StartTime,
    DateTime? EndTime,
    string Status,
    double TotalDifficultyScore,
    IReadOnlyList<RunSlotResponse> Slots)
{
    public static RunResponse FromEntity(Run run) =>
        new(
            run.Id,
            run.UserId,
            run.StartTime,
            run.EndTime,
            run.Status.ToString(),
            run.TotalDifficultyScore,
            run.Slots.OrderBy(s => s.Position).Select(RunSlotResponse.FromEntity).ToList());
}
