namespace GodGamerGauntlet.Api.Models;

public class User
{
    public Guid Id { get; set; }

    public required string Username { get; set; }

    public DateTime CreatedAt { get; set; }

    public ICollection<Run> Runs { get; set; } = new List<Run>();
}
