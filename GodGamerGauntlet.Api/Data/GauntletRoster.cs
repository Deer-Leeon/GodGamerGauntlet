namespace GodGamerGauntlet.Api.Data;

/// <summary>
/// The closed game roster. These are the only games in the catalog: the Draft
/// Room picks from them, the records directory lists them, and they are the
/// exact games named in the speedrun.com API license request
/// (<c>docs/elo-api-license-request.md</c>). Adding a game here widens what we
/// would import from speedrun.com, so the list and that letter move together.
/// </summary>
public static class GauntletRoster
{
    /// <param name="SrcAbbreviation">speedrun.com's exact lookup key — never fuzzy-matched.</param>
    public sealed record Entry(string Title, string SrcAbbreviation, int BaseDifficulty);

    /// <summary>Order here is the catalog's display order.</summary>
    public static readonly IReadOnlyList<Entry> Games =
    [
        new("Super Mario 64", "sm64", 78),
        new("Super Mario World", "smw", 74),
        new("Super Mario Odyssey", "smo", 72),
        new("Super Mario Bros.", "smb1", 68),
        new("The Legend of Zelda: Ocarina of Time", "oot", 82),
        new("The Legend of Zelda: Breath of the Wild", "botw", 80),
        new("Super Metroid", "sm", 76),
        new("Celeste", "celeste", 88),
        new("Hollow Knight", "hk", 84),
        new("Elden Ring", "er", 86),
        new("Dark Souls", "darksouls", 85),
        new("Minecraft", "mc", 70),
        new("Portal", "portal", 64),
        new("Portal 2", "portal2", 66),
        new("Pokémon Red/Blue", "pokedex-red", 71),
        new("Undertale", "undertale", 62),
        new("Cuphead", "cuphead", 87),
        new("Getting Over It", "gettingoverit", 90),
        new("Super Meat Boy", "smb", 89),
    ];

    public static readonly IReadOnlySet<string> TitleKeys =
        Games.Select(g => g.Title.ToLowerInvariant()).ToHashSet();

    public static bool Contains(string title) =>
        TitleKeys.Contains(title.ToLowerInvariant());
}
