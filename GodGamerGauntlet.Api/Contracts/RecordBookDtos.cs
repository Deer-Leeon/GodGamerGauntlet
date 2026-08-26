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

public record ProfileModeDto(
    int Attempts,
    int Clears,
    int Dnfs,
    int GamesBeaten,
    int BestSurvival,
    int BestSurvivalTotal,
    ProfileBoardDto? PersonalBest);

public record ProfileRunDto(
    Guid RunId,
    string Status,
    string RunType,
    DateTime? EndTime,
    double TotalScore,
    int SlotsCompleted,
    int TotalSlots,
    int? BoardRank,
    int? WouldBeRank,
    long ElapsedMs,
    IReadOnlyList<string> SlotStatuses,
    IReadOnlyList<string> SlotTitles,
    IReadOnlyList<string?> SlotThumbs);

/// <summary>Public roster row. Email is never included.</summary>
public record PlayerCardDto(
    string Username,
    DateTime CreatedAt,
    int AttemptCount,
    int ClearCount,
    int DnfCount,
    int? StandardRank,
    int? LiteRank,
    DateTime? LastRunAt);

public record UserProfileDto(
    Guid Id,
    string Username,
    DateTime CreatedAt,
    DateTime? LastRunAt,
    int AttemptCount,
    int ClearCount,
    int DnfCount,
    int GamesBeaten,
    ProfileModeDto Standard,
    ProfileModeDto Lite,
    IReadOnlyList<ProfileRunDto> Runs);
