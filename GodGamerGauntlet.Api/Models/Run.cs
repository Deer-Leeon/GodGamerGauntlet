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

    /// <summary>Speedrun timer state for the OBS overlay: idle | running | paused | finished.</summary>
    public string TimerStatus { get; set; } = "idle";

    /// <summary>Milliseconds accumulated on the timer as of <see cref="TimerUpdatedAt"/>.</summary>
    public long TimerElapsedMs { get; set; }

    /// <summary>When the timer last changed state; while running, elapsed extrapolates from here.</summary>
    public DateTime? TimerUpdatedAt { get; set; }

    /// <summary>
    /// Secret that lets the OBS overlay (which can't log in) trigger timer and
    /// split actions. Only ever revealed to the run owner.
    /// </summary>
    public string? OverlayKey { get; set; }

    public ICollection<RunSlot> Slots { get; set; } = new List<RunSlot>();

    public ICollection<RunVote> Votes { get; set; } = new List<RunVote>();

    public ICollection<RunComment> Comments { get; set; } = new List<RunComment>();

    public ICollection<RunReaction> Reactions { get; set; } = new List<RunReaction>();
}
