using System.Globalization;

namespace GodGamerGauntlet.Api.Services;

public static class Seasons
{
    /// <summary>
    /// null / "all" → all-time. "current" → this UTC month. "yyyy-MM" → that month.
    /// Returns false when the value is not a known season key.
    /// </summary>
    public static bool TryRange(string? season, out DateTime? start, out DateTime? end)
    {
        start = null;
        end = null;
        if (string.IsNullOrWhiteSpace(season) ||
            season.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var now = DateTime.UtcNow;
        if (season.Equals("current", StringComparison.OrdinalIgnoreCase))
        {
            start = MonthStart(now);
            end = start.Value.AddMonths(1);
            return true;
        }

        if (DateTime.TryParseExact(
                season,
                "yyyy-MM",
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out var parsed))
        {
            start = MonthStart(parsed);
            end = start.Value.AddMonths(1);
            return true;
        }

        return false;
    }

    public static DateTime MonthStart(DateTime utc) =>
        new(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    public static string Key(DateTime utc) => utc.ToString("yyyy-MM", CultureInfo.InvariantCulture);

    public static string Label(DateTime utc) =>
        utc.ToString("MMM yyyy", CultureInfo.InvariantCulture);
}
