namespace GodGamerGauntlet.Api.Contracts;

public record LeaderboardEntryDto(
    Guid RunId,
    string StreamerName,
    double TotalScore,
    string Status,
    int SlotsCompleted,
    DateTime? EndTime);
