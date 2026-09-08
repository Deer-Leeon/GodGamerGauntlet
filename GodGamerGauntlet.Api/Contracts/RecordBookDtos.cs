namespace GodGamerGauntlet.Api.Contracts;

public record LeaderboardEntryDto(
    Guid RunId,
    Guid UserId,
    string StreamerName,
    string? AvatarUrl,
    double TotalScore,
    string Status,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    long ElapsedMs,
    DateTime? EndTime,
    int Rank,
    IReadOnlyList<ArenaSlotDto> Games);

/// <summary>One slot of a drafted gauntlet, for the arena's "inspect wheel" view.</summary>
public record ArenaSlotDto(
    int Position,
    string Title,
    string? Thumb,
    int BaseDifficulty,
    string Status,
    long? SplitTimeMs);

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

public record SeasonModeChampionDto(string RunType, LeaderboardEntryDto? Entry);

public record SeasonChampionDto(
    string Season,
    string Label,
    IReadOnlyList<SeasonModeChampionDto> Modes);

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
    int? SprintRank,
    int? MarathonRank,
    int? EnduranceRank,
    int? StandardRank,
    int? LiteRank,
    DateTime? LastRunAt);

public record UserProfileDto(
    Guid Id,
    string Username,
    string? AvatarUrl,
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
    ProfileModeDto Sprint,
    ProfileModeDto Marathon,
    ProfileModeDto Endurance,
    ProfileModeDto Standard,
    ProfileModeDto Lite,
    IReadOnlyList<ProfileRunDto> Runs,
    IReadOnlyList<StreamLinkDto> StreamLinks,
    ProfileLiveRunDto? Live,
    bool IsFollowing,
    bool IsReserved,
    string? DisplayName,
    bool HasSrcAccount);

/// <summary>
/// One card on the homepage "Live Now" rail: a gauntlet whose timer is
/// running right now, with everything needed to send viewers to the stream.
/// </summary>
public record LiveRunCardDto(
    Guid RunId,
    string Username,
    string? AvatarUrl,
    string? StreamUrl,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    string? CurrentTitle,
    string? CurrentThumb,
    long ElapsedMs);

/// <summary>An in-progress gauntlet on a public profile, when one is running.</summary>
public record ProfileLiveRunDto(
    Guid RunId,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    int CurrentSlot,
    string? CurrentTitle,
    string? CurrentThumb,
    string TimerStatus,
    long ElapsedMs);
