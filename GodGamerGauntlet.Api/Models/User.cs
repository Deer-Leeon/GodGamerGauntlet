namespace GodGamerGauntlet.Api.Models;

public class User
{
    public const int AvatarUrlMaxLength = 500;

    public const int DisplayNameMaxLength = 100;
    public const int SrcUserIdMaxLength = 16;

    public Guid Id { get; set; }

    public required string Username { get; set; }

    /// <summary>
    /// SRC international name when it cannot be the public handle (length or
    /// charset). Profiles and boards show this when set; URLs still use Username.
    /// </summary>
    public string? DisplayName { get; set; }

    /// <summary>Public avatar image URL, shown on profiles and live-now cards.</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>
    /// Private login/contact address. Null for legacy handle-only accounts
    /// until they add one in settings.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>Null for legacy pre-auth accounts, which can no longer log in.</summary>
    public string? PasswordHash { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>Global admin: moderates every speedrun board and assigns per-game moderators.</summary>
    public bool IsAdmin { get; set; } = false;

    /// <summary>
    /// Placeholder for an imported SRC runner. Cannot log in until claimed.
    /// Distinct from legacy password-less accounts like GodGamerDemo.
    /// </summary>
    public bool IsReserved { get; set; }

    /// <summary>speedrun.com user id. Stable across name changes.</summary>
    public string? SrcUserId { get; set; }

    public ICollection<Run> Runs { get; set; } = new List<Run>();

    public ICollection<UserStreamLink> StreamLinks { get; set; } = new List<UserStreamLink>();

    public ICollection<UserFollow> Following { get; set; } = new List<UserFollow>();

    public ICollection<UserFollow> Followers { get; set; } = new List<UserFollow>();
}
