namespace GodGamerGauntlet.Api.Contracts;

public record LeaderboardEntryDto(
    Guid RunId,
    string StreamerName,
    double TotalScore,
    string Status,
    string RunType,
    int SlotsCompleted,
    // Games in the run: 10 for Standard, 5 for Lite.
    int TotalSlots,
    DateTime? EndTime);
