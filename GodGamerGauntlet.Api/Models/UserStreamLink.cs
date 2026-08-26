namespace GodGamerGauntlet.Api.Models;

/// <summary>A public Twitch or YouTube URL on a player's profile and live runs.</summary>
public class UserStreamLink
{
    public const int PlatformMaxLength = 20;
    public const int UrlMaxLength = 500;

    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    /// <summary>"twitch" or "youtube".</summary>
    public required string Platform { get; set; }

    public required string Url { get; set; }

    public int SortOrder { get; set; }
}
