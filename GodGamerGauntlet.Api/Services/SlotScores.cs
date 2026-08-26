using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// A beaten game is worth its BaseDifficulty. Play order is not a multiplier.
/// Earned score is that sum over Won slots — a quiet tiebreak among Clears.
/// </summary>
public static class SlotScores
{
    public static int ForGame(int baseDifficulty) => baseDifficulty;

    public static double Earned(IEnumerable<RunSlot> slots) =>
        slots
            .Where(s => s.Status == RunSlotStatus.Won)
            .Sum(s => s.Game?.BaseDifficulty ?? 0);
}
