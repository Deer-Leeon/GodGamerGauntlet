using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Slot score: BaseDifficulty × (1 + 0.1 × (Position − 1)²).
/// Earned score sums that over Won slots only.
/// </summary>
public static class SlotScores
{
    public static double ForSlot(int baseDifficulty, int position) =>
        baseDifficulty * (1 + 0.1 * Math.Pow(position - 1, 2));

    public static double Earned(IEnumerable<RunSlot> slots) =>
        Math.Round(
            slots
                .Where(s => s.Status == RunSlotStatus.Won)
                .Sum(s => ForSlot(s.Game?.BaseDifficulty ?? 0, s.Position)),
            1);
}
