namespace GodGamerGauntlet.Api.Models;

public class User
{
    public Guid Id { get; set; }

    public required string Username { get; set; }

    /// <summary>Null for legacy pre-auth accounts, which can no longer log in.</summary>
    public string? PasswordHash { get; set; }

    public DateTime CreatedAt { get; set; }

    public ICollection<Run> Runs { get; set; } = new List<Run>();
}
