namespace GodGamerGauntlet.Api.Models;

/// <summary>One individual-level board on a game, imported from speedrun.com.</summary>
public class GameLevel
{
    public const int NameMaxLength = 200;
    public const int SrcIdMaxLength = 16;
    public const int WeblinkMaxLength = 300;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public required string Name { get; set; }

    public string? SrcLevelId { get; set; }

    public string? Rules { get; set; }

    public string? Weblink { get; set; }

    public Game? Game { get; set; }
}
