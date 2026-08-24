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

    public ICollection<RunVote> Votes { get; set; } = new List<RunVote>();

    public ICollection<RunComment> Comments { get; set; } = new List<RunComment>();

    public ICollection<RunReaction> Reactions { get; set; } = new List<RunReaction>();
}
