namespace GodGamerGauntlet.Api.Contracts;

public record LeaderboardEntryDto(
    Guid RunId,
    Guid UserId,
    string StreamerName,
    double TotalScore,
    string Status,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    DateTime? EndTime,
    int Rank);

public record RunPlacementDto(
    string RunType,
    bool IsPersonalBest,
    int? BoardRank,
    int BoardSize,
    int? WouldBeRank,
    double LeaderScore,
    double? PersonalBestScore,
    Guid? PersonalBestRunId,
    int? PersonalBestRank);

public record ProfileBoardDto(
    int Rank,
    double Score,
    Guid RunId,
    int BoardSize);

public record ProfileRunDto(
    Guid RunId,
    string Status,
    string RunType,
    DateTime? EndTime,
    double TotalScore,
    int SlotsCompleted,
    int TotalSlots,
    int? BoardRank,
    int? WouldBeRank);

public record UserProfileDto(
    Guid Id,
    string Username,
    DateTime CreatedAt,
    ProfileBoardDto? Standard,
    ProfileBoardDto? Lite,
    int ClearCount,
    int DnfCount,
    IReadOnlyList<ProfileRunDto> RecentRuns);
