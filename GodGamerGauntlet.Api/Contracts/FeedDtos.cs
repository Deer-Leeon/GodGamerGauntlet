using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

/// <summary>One finished run rendered as a community feed post.</summary>
public record FeedPostDto(
    Guid RunId,
    Guid UserId,
    string StreamerName,
    string Status,
    DateTime? EndTime,
    double TotalScore,
    int SlotsCompleted,
    IReadOnlyList<string> SlotStatuses,
    int VoteScore,
    int MyVote,
    int CommentCount,
    IReadOnlyDictionary<string, int> Reactions,
    IReadOnlyList<string> MyReactions);

public record FeedPageDto(
    IReadOnlyList<FeedPostDto> Posts,
    int Page,
    bool HasMore);

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
