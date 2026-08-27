namespace GodGamerGauntlet.Api.Models;

/// <summary>Verification lifecycle of a speedrun submission.</summary>
public enum SubmissionStatus
{
    Pending = 0,
    Verified = 1,
    Rejected = 2,
}
