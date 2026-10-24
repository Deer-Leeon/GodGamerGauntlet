using System.Reflection;
using System.Text.Json;

namespace GodGamerGauntlet.Api.Data;

/// <summary>
/// The draft catalog: speedrun.com's 100 most-run games and 100 most-active
/// games, one row per game. Loaded from <c>PopularGames.json</c>. This file is
/// identity only (title, source id, chart place). Categories, rules, and runs
/// are filled by the speedrun.com import.
/// Covers are Wikimedia or Steam CDN when we have one — never speedrun.com images.
/// </summary>
public static class GauntletRoster
{
    /// <param name="SrcAbbreviation">speedrun.com's exact lookup key — never fuzzy-matched.</param>
    public sealed record Entry(
        string Title,
        string SrcAbbreviation,
        string SrcGameId,
        int BaseDifficulty,
        string? Thumb,
        int? AllTimeRank,
        int? RecentRank);

    /// <summary>All-time chart first, then games that are only on the active chart.</summary>
    public static readonly IReadOnlyList<Entry> Games = Load();

    public static readonly IReadOnlySet<string> TitleKeys =
        Games.Select(g => g.Title.ToLowerInvariant()).ToHashSet();

    public static bool Contains(string title) =>
        TitleKeys.Contains(title.ToLowerInvariant());

    /// <summary>Catalog sort key. All-time rank leads; active-only games follow.</summary>
    public static int PopularityRank(Entry entry) =>
        entry.AllTimeRank ?? (100 + (entry.RecentRank ?? 999));

    private static IReadOnlyList<Entry> Load()
    {
        var assembly = typeof(GauntletRoster).Assembly;
        var name = assembly.GetManifestResourceNames()
            .Single(n => n.EndsWith("PopularGames.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Missing embedded resource {name}.");
        var file = JsonSerializer.Deserialize<RosterFile>(stream, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        }) ?? throw new InvalidOperationException("PopularGames.json was empty.");
        if (file.Games.Count == 0)
            throw new InvalidOperationException("PopularGames.json did not contain any games.");
        return file.Games.Select(g => new Entry(
            g.Title,
            g.Abbreviation,
            g.SrcGameId,
            g.BaseDifficulty is >= 1 and <= 100 ? g.BaseDifficulty : 65,
            g.Thumb,
            g.AllTimeRank,
            g.RecentRank
        )).ToList();
    }

    private sealed class RosterFile
    {
        public List<GameJson> Games { get; set; } = [];
    }

    private sealed class GameJson
    {
        public string Title { get; set; } = "";
        public string Abbreviation { get; set; } = "";
        public string SrcGameId { get; set; } = "";
        public int BaseDifficulty { get; set; }
        public string? Thumb { get; set; }
        public int? AllTimeRank { get; set; }
        public int? RecentRank { get; set; }
    }
}
