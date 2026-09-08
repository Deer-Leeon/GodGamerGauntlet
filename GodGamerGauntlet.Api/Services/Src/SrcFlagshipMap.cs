using GodGamerGauntlet.Api.Data;

namespace GodGamerGauntlet.Api.Services.Src;

/// <summary>
/// The speedrun.com boards we import, projected straight from
/// <see cref="GauntletRoster"/> — the catalog roster and the licensed board
/// list are the same 19 games by construction. Titles match a catalog
/// <c>Game.Title</c> (case-insensitive); abbreviations are speedrun.com's exact
/// lookup keys, never fuzzy-matched.
/// </summary>
public static class SrcFlagshipMap
{
    public sealed record Entry(string Abbreviation, string Title);

    public static readonly IReadOnlyList<Entry> Games =
        GauntletRoster.Games
            .Select(g => new Entry(g.SrcAbbreviation, g.Title))
            .ToList();

    public static Entry? FindByAbbreviation(string abbreviation) =>
        Games.FirstOrDefault(g =>
            g.Abbreviation.Equals(abbreviation, StringComparison.OrdinalIgnoreCase));
}
