namespace GodGamerGauntlet.Api.Models;

/// <summary>What kind of trick this vault row teaches.</summary>
public enum GameTechKind
{
    Skip = 0,
    Movement = 1,
    Boss = 2,
    Glitch = 3,
    OutOfBounds = 4,
    Route = 5,
}

/// <summary>How tight the execution window is.</summary>
public enum GameTechDifficulty
{
    Easy = 0,
    Medium = 1,
    Hard = 2,
    FrameTight = 3,
}

/// <summary>Where the trick still works.</summary>
public enum GameTechPatchScope
{
    All = 0,
    VersionLocked = 1,
    Patched = 2,
}

/// <summary>Public visibility. Draft rows stay off the GET list.</summary>
public enum GameTechStatus
{
    Published = 0,
    Patched = 1,
    Disputed = 2,
    Draft = 3,
}

/// <summary>Embed host. Same two as proof VODs — no rehosting.</summary>
public enum GameTechClipProvider
{
    YouTube = 0,
    TwitchClip = 1,
}

public enum GameTechReportKind
{
    Patched = 0,
    Broken = 1,
    Unsafe = 2,
}

public enum GameTechReportStatus
{
    Pending = 0,
    Accepted = 1,
    Rejected = 2,
}
