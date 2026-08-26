namespace GodGamerGauntlet.Api.Contracts;

/// <summary>One drafted game as shown on the OBS overlay wheel.</summary>
public record OverlaySlotDto(
    Guid GameId,
    int SlotNumber,
    string Title,
    string? Thumb,
    int BaseDifficulty,
    bool Completed,
    long? SplitTimeMs,
    string Status);

public record OverlayStateDto(
    Guid RunId,
    string StreamerName,
    string RunStatus,
    // "Standard" (10 games) or "Lite" (5).
    string RunType,
    int CurrentSlotIndex,
    string TimerStatus,
    long ElapsedMs,
    IReadOnlyList<OverlaySlotDto> Games,
    string? OverlayKey,
    IReadOnlyDictionary<string, int> Reactions);
