namespace GodGamerGauntlet.Api.Models;

/// <summary>One runner on a submission. Solo runs have a single row; co-op runs have several.</summary>
public class SubmissionPlayer
{
    public const int NameMaxLength = 100;
    public const int SrcIdMaxLength = 16;

    public Guid Id { get; set; }

    public Guid SubmissionId { get; set; }

    public Guid? UserId { get; set; }

    public required string Name { get; set; }

    public string? SrcUserId { get; set; }

    public bool IsGuest { get; set; }

    public int SortOrder { get; set; }

    public Submission? Submission { get; set; }

    public User? User { get; set; }
}
