namespace GodGamerGauntlet.Api.Models;

/// <summary>One player following another. Live followed people stay in Followed, not Live.</summary>
public class UserFollow
{
    public Guid Id { get; set; }

    public Guid FollowerId { get; set; }

    public Guid FollowedId { get; set; }

    public DateTime CreatedAt { get; set; }

    public User? Follower { get; set; }

    public User? Followed { get; set; }
}
