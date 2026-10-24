namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One slice of a speedrun.com run import. A structure row loads boards for a
/// game; each run row is a category, status, and optional level, platform,
/// region, and emulator filter. Empty strings mean "not filtered" so the
/// unique key works in Postgres, which treats nulls as distinct.
/// </summary>
public class SrcImportCursor
{
    public const int SrcIdMaxLength = 16;
    public const int StatusMaxLength = 20;
    public const int EmulatedMaxLength = 8;
    public const int NoteMaxLength = 500;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    /// <summary>When true, the next step imports categories, levels, and variables.</summary>
    public bool IsStructure { get; set; }

    public string CategorySrcId { get; set; } = "";

    /// <summary>speedrun.com status filter. Bulk import only walks verified runs.</summary>
    public string Status { get; set; } = "";

    public string LevelSrcId { get; set; } = "";

    public string PlatformSrcId { get; set; } = "";

    public string RegionSrcId { get; set; } = "";

    /// <summary>"" until the slice is split, then "true" or "false".</summary>
    public string Emulated { get; set; } = "";

    public int Offset { get; set; }

    public bool Completed { get; set; }

    /// <summary>Replaced by narrower slices after the 10,000-row page cap.</summary>
    public bool Superseded { get; set; }

    public string? Note { get; set; }

    public DateTime UpdatedAt { get; set; }

    public Game? Game { get; set; }
}
