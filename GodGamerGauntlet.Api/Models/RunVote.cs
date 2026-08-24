namespace GodGamerGauntlet.Api.Models;

/// <summary>Reddit-style vote on a finished run. One row per (run, user); Value is +1 or -1.</summary>
public class RunVote
{
    public Guid Id { get; set; }

    public Guid RunId { get; set; }

    public Run? Run { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public int Value { get; set; }

    public DateTime CreatedAt { get; set; }
}
