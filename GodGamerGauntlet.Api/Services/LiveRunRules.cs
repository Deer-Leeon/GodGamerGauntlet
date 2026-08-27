using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

/// <summary>Shared mapping for in-progress gauntlets on the feed and browse rail.</summary>
public static class LiveRunRules
{
    public static LiveRunDto FromRun(Run run)
    {
        var slots = run.Slots.OrderBy(s => s.Position).ToList();
        var current = slots.FindIndex(s => s.Status != RunSlotStatus.Won);
        if (current < 0) current = Math.Max(0, slots.Count - 1);
        var currentSlot = slots.ElementAtOrDefault(current);
        return new LiveRunDto(
            run.Id,
            run.UserId,
            run.User?.Username ?? "unknown",
            run.RunType.ToString(),
            slots.Count(s => s.Status == RunSlotStatus.Won),
            run.RunType.SlotCount(),
            current + 1,
            currentSlot?.Game?.Title,
            currentSlot?.Game?.Thumb,
            StreamLinkDto.FromUser(run.User));
    }

    /// <summary>
    /// Far enough that a spectator might see a Clear: game 8+ of 10, or 4+ of 5.
    /// </summary>
    public static bool IsFarAlong(LiveRunDto run) =>
        run.CurrentSlot >= Math.Max(2, (int)Math.Ceiling(run.TotalSlots * 0.8));
}
