namespace GodGamerGauntlet.Api.Models;

public class User
{
    public Guid Id { get; set; }

    public required string Username { get; set; }

    /// <summary>
    /// Private login/contact address. Null for legacy handle-only accounts
    /// until they add one in settings.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>Null for legacy pre-auth accounts, which can no longer log in.</summary>
    public string? PasswordHash { get; set; }

    public DateTime CreatedAt { get; set; }

    public ICollection<Run> Runs { get; set; } = new List<Run>();
}
