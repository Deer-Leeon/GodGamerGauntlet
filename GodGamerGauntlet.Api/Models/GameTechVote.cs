namespace GodGamerGauntlet.Api.Models;

/// <summary>One vote per user per trick. Value is +1 or -1.</summary>
public class GameTechVote
{
    public Guid Id { get; set; }

    public Guid TechId { get; set; }

    public GameTech? Tech { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public int Value { get; set; }

    public DateTime CreatedAt { get; set; }
}
