namespace GodGamerGauntlet.Api.Contracts;

/// <summary>One drafted game as shown on the OBS overlay wheel.</summary>
public record OverlaySlotDto(
    Guid GameId,
    int SlotNumber,
    string Title,
    string? Thumb,
    int BaseDifficulty,
    bool Completed,
    long? SplitTimeMs);

/// <summary>
/// The synchronized run state shared by the OBS overlay and the control deck.
/// ElapsedMs is computed server-side at response time; while the timer is
/// running, clients extrapolate locally between polls.
/// </summary>
public record OverlayStateDto(
    Guid RunId,
    string StreamerName,
    string RunStatus,
    int CurrentSlotIndex,
    string TimerStatus,
    long ElapsedMs,
    IReadOnlyList<OverlaySlotDto> Games,
    string? OverlayKey);
