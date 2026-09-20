namespace GodGamerGauntlet.Api.Models;

/// <summary>A runner flagging a trick as patched, broken, or unsafe.</summary>
public class GameTechReport
{
    public const int NoteMaxLength = 500;

    public Guid Id { get; set; }

    public Guid TechId { get; set; }

    public GameTech? Tech { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public GameTechReportKind Kind { get; set; }

    public string? Note { get; set; }

    public GameTechReportStatus Status { get; set; } = GameTechReportStatus.Pending;

    public DateTime CreatedAt { get; set; }
}
