namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One ruleset on a game's speedrun board (Any%, 100%, Glitchless). Every
/// submission belongs to exactly one category; the category's rules text is
/// the contract examiners verify against.
/// </summary>
public class Category
{
    public const int NameMaxLength = 100;

    public const int SrcIdMaxLength = 16;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public required string Name { get; set; }

    /// <summary>speedrun.com category id when this board was imported.</summary>
    public string? SrcCategoryId { get; set; }

    /// <summary>Markdown rules the community moderators maintain.</summary>
    public string? Rules { get; set; }

    public DateTime CreatedAt { get; set; }

    public Game? Game { get; set; }

    public ICollection<Variable> Variables { get; set; } = new List<Variable>();

    public ICollection<Submission> Submissions { get; set; } = new List<Submission>();
}
