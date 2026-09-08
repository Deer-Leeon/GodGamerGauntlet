namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// Maps a local catalog game to a speedrun.com game. RAWG ids stay on
/// <see cref="Game.ExternalId"/>; SRC ids never share that column.
/// </summary>
public class GameSrcLink
{
    public const int SrcIdMaxLength = 16;
    public const int AbbreviationMaxLength = 40;
    public const int WeblinkMaxLength = 300;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public required string SrcGameId { get; set; }

    public required string SrcAbbreviation { get; set; }

    public string? SrcWeblink { get; set; }

    /// <summary>When false the bulk importer skips this game; claim import still may fill the claimant's PBs.</summary>
    public bool ImportEnabled { get; set; } = true;

    public Game? Game { get; set; }
}
