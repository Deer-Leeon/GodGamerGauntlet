namespace GodGamerGauntlet.Api.Data;

/// <summary>
/// The closed game roster. These are the only games in the catalog: the Draft
/// Room picks from them, the records directory lists them, and they are the
/// exact games named in the speedrun.com API license request
/// (<c>docs/elo-api-license-request.md</c>). Adding a game here widens what we
/// would import from speedrun.com, so the list and that letter move together.
/// Covers are Wikimedia or Steam CDN — never speedrun.com-hosted images.
/// </summary>
public static class GauntletRoster
{
    /// <param name="SrcAbbreviation">speedrun.com's exact lookup key — never fuzzy-matched.</param>
    public sealed record Entry(
        string Title,
        string SrcAbbreviation,
        int BaseDifficulty,
        string? Thumb);

    /// <summary>Order here is the catalog's display order.</summary>
    public static readonly IReadOnlyList<Entry> Games =
    [
        new("Super Mario 64", "sm64", 78, Wiki("Super Mario 64 box cover.jpg")),
        new("Super Mario World", "smw", 74, Wiki("Super Mario World Coverart.png")),
        new("Super Mario Odyssey", "smo", 72, Wiki("Super Mario Odyssey.jpg")),
        new("Super Mario Bros.", "smb1", 68, Wiki("Super Mario Bros. box.png")),
        new("The Legend of Zelda: Ocarina of Time", "oot", 82, Wiki("The Legend of Zelda Ocarina of Time.jpg")),
        new("The Legend of Zelda: Breath of the Wild", "botw", 80, Wiki("The Legend of Zelda Breath of the Wild.jpg")),
        new("Super Metroid", "sm", 76, Wiki("Super Metroid.jpg")),
        new("Celeste", "celeste", 88, Steam(504230)),
        new("Hollow Knight", "hk", 84, Steam(367520)),
        new("Elden Ring", "er", 86, Steam(1245620)),
        new("Dark Souls", "darksouls", 85, Steam(570940)),
        new("Minecraft", "mc", 70, Wiki("Minecraft cover.png")),
        new("Portal", "portal", 64, Steam(400)),
        new("Portal 2", "portal2", 66, Steam(620)),
        new("Pokémon Red/Blue", "pokedex-red", 71, Wiki("Pokémon Red Version.jpg")),
        new("Undertale", "undertale", 62, Steam(391540)),
        new("Cuphead", "cuphead", 87, Steam(268910)),
        new("Getting Over It", "gettingoverit", 90, Steam(240720)),
        new("Super Meat Boy", "smb", 89, Steam(40800)),
    ];

    public static readonly IReadOnlySet<string> TitleKeys =
        Games.Select(g => g.Title.ToLowerInvariant()).ToHashSet();

    public static bool Contains(string title) =>
        TitleKeys.Contains(title.ToLowerInvariant());

    private static string Wiki(string fileName) =>
        "https://en.wikipedia.org/wiki/Special:FilePath/" + Uri.EscapeDataString(fileName);

    private static string Steam(int appId) =>
        $"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg";
}
