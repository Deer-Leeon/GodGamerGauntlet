namespace GodGamerGauntlet.Api.Models;

public class Run
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime? EndTime { get; set; }

    public RunStatus Status { get; set; }

    public double TotalDifficultyScore { get; set; }

    public ICollection<RunSlot> Slots { get; set; } = new List<RunSlot>();
}
