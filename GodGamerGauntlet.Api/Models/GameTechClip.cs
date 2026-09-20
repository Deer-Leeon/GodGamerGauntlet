namespace GodGamerGauntlet.Api.Models;

/// <summary>YouTube or Twitch clip embed for a vault row. Never rehosted.</summary>
public class GameTechClip
{
    public Guid Id { get; set; }

    public Guid TechId { get; set; }

    public GameTech? Tech { get; set; }

    public GameTechClipProvider Provider { get; set; }

    public required string Url { get; set; }

    public int? StartSeconds { get; set; }

    public int SortOrder { get; set; }
}
