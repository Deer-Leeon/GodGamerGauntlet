namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// A per-category axis a runner picks a value on (Platform, Glitch Restriction).
/// Subcategory variables split the leaderboard into distinct boards; the rest
/// act as filters on a single board.
/// </summary>
public class Variable
{
    public const int NameMaxLength = 100;

    public const int SrcIdMaxLength = 16;

    public Guid Id { get; set; }

    public Guid CategoryId { get; set; }

    public required string Name { get; set; }

    /// <summary>speedrun.com variable id when imported. The same SRC variable may be copied onto each local category it applies to.</summary>
    public string? SrcVariableId { get; set; }

    /// <summary>True when each value gets its own leaderboard split.</summary>
    public bool IsSubcategory { get; set; }

    /// <summary>True when a submission must select a value for this variable.</summary>
    public bool IsRequired { get; set; }

    public Category? Category { get; set; }

    public ICollection<VariableValue> Values { get; set; } = new List<VariableValue>();
}
