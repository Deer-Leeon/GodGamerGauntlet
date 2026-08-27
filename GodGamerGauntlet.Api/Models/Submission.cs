namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One speedrun on the verified ledger. Unlike gauntlet Runs, a submission is
/// never self-certified: it enters Pending with VOD proof and only an examiner
/// moves it to Verified or Rejected. Rows are historical record — obsoleted
/// PBs stay, and FK delete behaviors are Restrict to protect the ledger.
/// </summary>
public class Submission
{
    public const int VideoUrlMaxLength = 500;
    public const int RejectReasonMaxLength = 1000;

    public Guid Id { get; set; }

    public Guid GameId { get; set; }

    public Guid CategoryId { get; set; }

    public Guid PlayerId { get; set; }

    /// <summary>The strict leaderboard metric, in milliseconds.</summary>
    public long PrimaryTimeMs { get; set; }

    /// <summary>Twitch or YouTube proof. No video, no verification.</summary>
    public required string VideoUrl { get; set; }

    /// <summary>When the run was played, as claimed by the runner.</summary>
    public DateTimeOffset PlayedOn { get; set; }

    public bool IsEmulator { get; set; }

    public SubmissionStatus Status { get; set; } = SubmissionStatus.Pending;

    /// <summary>The moderator who verified or rejected the run.</summary>
    public Guid? ExaminerId { get; set; }

    public string? RejectReason { get; set; }

    public DateTime SubmittedAt { get; set; }

    /// <summary>When the examiner decided; null while Pending.</summary>
    public DateTime? ReviewedAt { get; set; }

    public Game? Game { get; set; }

    public Category? Category { get; set; }

    public User? Player { get; set; }

    public User? Examiner { get; set; }

    public ICollection<SubmissionVariable> Variables { get; set; } = new List<SubmissionVariable>();
}
