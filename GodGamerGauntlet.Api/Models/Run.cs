namespace GodGamerGauntlet.Api.Models;

public class Run
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public DateTime StartTime { get; set; }

    public DateTime? EndTime { get; set; }

    public RunStatus Status { get; set; }

    /// <summary>Standard (10 games) or Lite (5). Drives slot limits and leaderboard split.</summary>
    public RunType RunType { get; set; } = RunType.Standard;

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

    /// <summary>
    /// Short public code for this attempt (e.g. XK4M2P). Rotates on reset.
    /// </summary>
    public string? AttemptCode { get; set; }

    public ICollection<RunSlot> Slots { get; set; } = new List<RunSlot>();

    public ICollection<RunVote> Votes { get; set; } = new List<RunVote>();

    public ICollection<RunComment> Comments { get; set; } = new List<RunComment>();

    public ICollection<RunReaction> Reactions { get; set; } = new List<RunReaction>();

    /// <summary>
    /// Live overlay clock: stored elapsed, plus time since last play if running.
    /// </summary>
    public long CurrentElapsedMs(DateTime utcNow)
    {
        var elapsed = (double)TimerElapsedMs;
        if (TimerStatus == "running" && TimerUpdatedAt is DateTime since)
        {
            elapsed += Math.Max(0, (utcNow - since).TotalMilliseconds);
        }
        return (long)elapsed;
    }
}
