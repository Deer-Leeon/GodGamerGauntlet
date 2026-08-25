namespace GodGamerGauntlet.Api.Models;

/// <summary>Gauntlet length. Stored as a string, like <see cref="RunStatus"/>.</summary>
public enum RunType
{
    /// <summary>The full 10-game gauntlet.</summary>
    Standard = 0,

    /// <summary>Gauntlet Lite — a 5-game variant.</summary>
    Lite = 1
}

public static class RunTypes
{
    public const int StandardSlotCount = 10;
    public const int LiteSlotCount = 5;

    /// <summary>
    /// Single source of truth for how many games a run of this type holds.
    /// Everything that draws "x/N" or decides a run is finished derives from here.
    /// </summary>
    public static int SlotCount(this RunType runType) => runType switch
    {
        RunType.Lite => LiteSlotCount,
        _ => StandardSlotCount
    };

    /// <summary>
    /// Parses a client-supplied run type, defaulting to Standard when omitted.
    /// Rejects undefined values — plain Enum.TryParse would happily turn "99"
    /// into an out-of-range RunType.
    /// </summary>
    public static bool TryParse(string? value, out RunType runType)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            runType = RunType.Standard;
            return true;
        }

        return Enum.TryParse(value, ignoreCase: true, out runType)
               && Enum.IsDefined(runType);
    }
}
