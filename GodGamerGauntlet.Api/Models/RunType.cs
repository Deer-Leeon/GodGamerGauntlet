namespace GodGamerGauntlet.Api.Models;

/// <summary>Gauntlet length. Stored as a string, like <see cref="RunStatus"/>.</summary>
public enum RunType
{
    /// <summary>Legacy 10-game gauntlet. No longer offered at draft.</summary>
    Standard = 0,

    /// <summary>Legacy 5-game variant. No longer offered at draft.</summary>
    Lite = 1,

    /// <summary>Three full-game speedruns.</summary>
    Sprint = 2,

    /// <summary>Five full-game speedruns.</summary>
    Marathon = 3,

    /// <summary>Seven full-game speedruns.</summary>
    Endurance = 4
}

public static class RunTypes
{
    public const int StandardSlotCount = 10;
    public const int LiteSlotCount = 5;
    public const int SprintSlotCount = 3;
    public const int MarathonSlotCount = 5;
    public const int EnduranceSlotCount = 7;

    public const int MinLiveSlotCount = SprintSlotCount;
    public const int MaxLiveSlotCount = EnduranceSlotCount;

    public static readonly RunType[] Live =
        [RunType.Sprint, RunType.Marathon, RunType.Endurance];

    public static readonly RunType[] Legacy =
        [RunType.Standard, RunType.Lite];

    public static bool IsLive(this RunType runType) =>
        runType is RunType.Sprint or RunType.Marathon or RunType.Endurance;

    public static bool IsLegacy(this RunType runType) =>
        runType is RunType.Standard or RunType.Lite;

    /// <summary>
    /// Single source of truth for how many games a run of this type holds.
    /// Everything that draws "x/N" or decides a run is finished derives from here.
    /// </summary>
    public static int SlotCount(this RunType runType) => runType switch
    {
        RunType.Sprint => SprintSlotCount,
        RunType.Marathon => MarathonSlotCount,
        RunType.Endurance => EnduranceSlotCount,
        RunType.Lite => LiteSlotCount,
        _ => StandardSlotCount
    };

    public static string DisplayName(this RunType runType) => runType.ToString();

    /// <summary>
    /// Far enough that a DNF is a deep run: 70% of the lineup, or last-minus-one
    /// on a Sprint so three games can still have a deep fail.
    /// </summary>
    public static bool IsDeepProgress(this RunType runType, int slotsCompleted)
    {
        var n = runType.SlotCount();
        var need = n <= 3 ? n - 1 : (int)Math.Ceiling(n * 0.7);
        return slotsCompleted >= need;
    }

    /// <summary>
    /// Parses a client-supplied run type, defaulting to Marathon when omitted.
    /// Rejects undefined values — plain Enum.TryParse would happily turn "99"
    /// into an out-of-range RunType.
    /// </summary>
    public static bool TryParse(string? value, out RunType runType)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            runType = RunType.Marathon;
            return true;
        }

        return Enum.TryParse(value, ignoreCase: true, out runType)
               && Enum.IsDefined(runType);
    }
}
