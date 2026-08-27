using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

/// <summary>One finished run rendered as a community feed post.</summary>
public record FeedPostDto(
    Guid RunId,
    Guid UserId,
    string StreamerName,
    string Status,
    // "Standard" (10 games) or "Lite" (5).
    string RunType,
    DateTime? EndTime,
    double TotalScore,
    int SlotsCompleted,
    // Games in the run, so the feed can render "x of 5" for Lite runs.
    int TotalSlots,
    IReadOnlyList<string> SlotStatuses,
    IReadOnlyList<string> SlotTitles,
    IReadOnlyList<string?> SlotThumbs,
    // Overlay speedrun clock at finish (0 when the run never used the timer).
    long ElapsedMs,
    // Cumulative split clock per slot, parallel to SlotTitles. Null if unbeaten.
    IReadOnlyList<long?> SlotSplitTimes,
    int VoteScore,
    int MyVote,
    int CommentCount,
    IReadOnlyDictionary<string, int> Reactions,
    IReadOnlyList<string> MyReactions,
    int? BoardRank,
    int? WouldBeRank,
    IReadOnlyList<string> Moments);

public record FeedPageDto(
    IReadOnlyList<FeedPostDto> Posts,
    int Page,
    bool HasMore,
    IReadOnlyList<LiveRunDto> Live);

/// <summary>An in-progress gauntlet shown above the finished feed.</summary>
public record LiveRunDto(
    Guid RunId,
    Guid UserId,
    string StreamerName,
    string RunType,
    int SlotsCompleted,
    int TotalSlots,
    int CurrentSlot,
    string? CurrentTitle,
    string? CurrentThumb,
    IReadOnlyList<StreamLinkDto> StreamLinks);

public record SidebarFollowedDto(string Username, LiveRunDto? Live);

public record SidebarDto(
    IReadOnlyList<SidebarFollowedDto> Followed,
    IReadOnlyList<LiveRunDto> Live,
    IReadOnlyList<LiveRunDto> BestRuns);

public record VoteRequest([Range(-1, 1)] int Value);

public record VoteResponse(int VoteScore, int MyVote);

public record ReactionToggleRequest([Required] string Type);

public record ReactionsResponse(
    IReadOnlyDictionary<string, int> Reactions,
    IReadOnlyList<string> MyReactions);

public record CreateCommentRequest(
    [Required, MinLength(1), MaxLength(1000)] string Body);

public record CommentDto(Guid Id, Guid UserId, string Username, string Body, DateTime CreatedAt)
{
    public static CommentDto FromEntity(RunComment comment) =>
        new(comment.Id, comment.UserId, comment.User?.Username ?? "unknown", comment.Body, comment.CreatedAt);
}
