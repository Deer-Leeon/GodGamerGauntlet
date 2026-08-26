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
    int? PersonalBestRank,
    string RecapTitle,
    int? NextRank,
    double? PointsToNext,
    string? NextUsername);

public record ProfileBoardDto(
    int Rank,
    double Score,
    Guid RunId,
    int BoardSize,
    int? NextRank,
    double? PointsToNext,
    string? NextUsername);

public record ProfileGameDto(
    Guid GameId,
    string Title,
    string? Thumb,
    int Count);

public record SeasonChampionDto(
    string Season,
    string Label,
    LeaderboardEntryDto? Standard,
    LeaderboardEntryDto? Lite);

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
    IReadOnlyList<string?> SlotThumbs,
    IReadOnlyList<string> Moments);

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
    string? Title,
    IReadOnlyList<string> Titles,
    IReadOnlyList<ProfileGameDto> Beaten,
    IReadOnlyList<ProfileGameDto> Killers,
    ProfileModeDto Standard,
    ProfileModeDto Lite,
    IReadOnlyList<ProfileRunDto> Runs,
    IReadOnlyList<StreamLinkDto> StreamLinks,
    ProfileLiveRunDto? Live);

/// <summary>An in-progress gauntlet on a public profile, when one is running.</summary>
public record ProfileLiveRunDto(
    Guid RunId,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    int CurrentSlot,
    string? CurrentTitle,
    string? CurrentThumb);
