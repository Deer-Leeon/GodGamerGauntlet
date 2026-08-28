namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// Grants one user examiner power over one game's speedrun board. Composite
/// PK (GameId, UserId) — a user moderates a game once. Global admins
/// (User.IsAdmin) can examine every board without rows here.
/// </summary>
public class GameModerator
{
    public Guid GameId { get; set; }

    public Guid UserId { get; set; }

    public DateTimeOffset AssignedAt { get; set; }

    public Game? Game { get; set; }

    public User? User { get; set; }
}
