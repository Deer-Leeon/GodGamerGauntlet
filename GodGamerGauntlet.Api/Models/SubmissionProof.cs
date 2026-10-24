namespace GodGamerGauntlet.Api.Models;

/// <summary>A video or proof link recorded on a run. The link is stored, not the video.</summary>
public class SubmissionProof
{
    public const int UrlMaxLength = 500;

    public Guid Id { get; set; }

    public Guid SubmissionId { get; set; }

    public required string Url { get; set; }

    public int SortOrder { get; set; }

    public Submission? Submission { get; set; }
}
