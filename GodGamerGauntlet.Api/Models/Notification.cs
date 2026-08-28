namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One in-app alert for one user: run verdicts, WR snipes, and whatever the
/// moderation engine wants to shout about. Clicking it navigates to ActionUrl.
/// </summary>
public class Notification
{
    public const int MessageMaxLength = 500;
    public const int ActionUrlMaxLength = 400;

    public Guid Id { get; set; }

    /// <summary>The recipient. Notifications die with their user.</summary>
    public Guid UserId { get; set; }

    public string Message { get; set; } = string.Empty;

    /// <summary>Frontend route to open when the notification is clicked.</summary>
    public string ActionUrl { get; set; } = string.Empty;

    public bool IsRead { get; set; }

    // DateTime (UTC), not the spec's DateTimeOffset: the inbox is sorted by
    // this column and SQLite (integration tests) can't ORDER BY DateTimeOffset.
    public DateTime CreatedAt { get; set; }

    public User? User { get; set; }
}
