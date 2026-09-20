namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One skip, glitch, or movement trick on a roster game. Categories on the
/// records board are examiner contracts; this is how-to knowledge.
/// </summary>
public class GameTech
{
    public const int SlugMaxLength = 80;
    public const int TitleMaxLength = 120;
    public const int SummaryMaxLength = 500;
    public const int VersionNoteMaxLength = 80;
    public const int PrerequisitesMaxLength = 240;
    public const int LoadoutMaxLength = 240;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public Game? Game { get; set; }

    public required string Slug { get; set; }

    public required string Title { get; set; }

    public required string Summary { get; set; }

    public string? BodyMarkdown { get; set; }

    public GameTechKind Kind { get; set; }

    public GameTechDifficulty Difficulty { get; set; }

    public GameTechPatchScope PatchScope { get; set; }

    public string? VersionNote { get; set; }

    public string? Prerequisites { get; set; }

    public string? Loadout { get; set; }

    public GameTechStatus Status { get; set; } = GameTechStatus.Published;

    public Guid? AuthorUserId { get; set; }

    public User? Author { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public ICollection<GameTechClip> Clips { get; set; } = new List<GameTechClip>();

    public ICollection<GameTechVote> Votes { get; set; } = new List<GameTechVote>();

    public ICollection<GameTechReport> Reports { get; set; } = new List<GameTechReport>();
}
