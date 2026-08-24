namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// Emoji-style reaction on a finished run. A user can toggle each type at most
/// once per run (unique on RunId + UserId + Type).
/// </summary>
public class RunReaction
{
    public const int TypeMaxLength = 20;

    /// <summary>The fixed set of reactions the API accepts.</summary>
    public static readonly IReadOnlySet<string> AllowedTypes =
        new HashSet<string>(StringComparer.Ordinal) { "fire", "skull", "crown", "gg" };

    public Guid Id { get; set; }

    public Guid RunId { get; set; }

    public Run? Run { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public required string Type { get; set; }

    public DateTime CreatedAt { get; set; }
}
