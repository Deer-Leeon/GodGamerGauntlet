using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Contracts;

public record SubmitRunRequest(
    [Required] Guid GameId,
    [Required] Guid CategoryId,
    [Range(1, long.MaxValue)] long PrimaryTimeMs,
    [Required, MaxLength(500)] string VideoUrl,
    [Required] DateTimeOffset PlayedOn,
    bool IsEmulator,
    IReadOnlyList<Guid>? VariableValueIds);

/// <summary>One selected variable on a submission ("Platform: Nintendo 64").</summary>
public record SubmissionVariableDto(
    Guid VariableValueId,
    string VariableName,
    string Value,
    bool IsSubcategory);

/// <summary>Full submission detail, including the review audit trail.</summary>
public record SubmissionDto(
    Guid Id,
    Guid GameId,
    string GameTitle,
    Guid CategoryId,
    string CategoryName,
    Guid PlayerId,
    string PlayerName,
    long PrimaryTimeMs,
    string VideoUrl,
    DateTimeOffset PlayedOn,
    bool IsEmulator,
    string Status,
    bool IsObsolete,
    DateTime SubmittedAt,
    DateTime? ReviewedAt,
    string? ExaminerName,
    string? RejectReason,
    IReadOnlyList<SubmissionVariableDto> Variables,
    string Origin,
    string? SrcRunUrl);

/// <summary>A pending run in a moderator's verification queue.</summary>
public record ModerationQueueItemDto(
    Guid SubmissionId,
    Guid GameId,
    string GameTitle,
    string CategoryName,
    Guid PlayerId,
    string PlayerName,
    DateTime PlayerJoined,
    long PrimaryTimeMs,
    string VideoUrl,
    DateTimeOffset PlayedOn,
    bool IsEmulator,
    DateTime SubmittedAt,
    IReadOnlyList<SubmissionVariableDto> Variables);

public record ReviewRequest(
    // "Verify" or "Reject".
    [Required] string Action,
    [MaxLength(1000)] string? RejectReason);

public record AssignModeratorRequest([Required] string Username);

public record ModeratorDto(Guid UserId, string Username, DateTimeOffset AssignedAt);
