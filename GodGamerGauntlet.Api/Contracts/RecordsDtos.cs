using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

/// <summary>Create or rename a category; Rules is moderator-maintained markdown.</summary>
public record SaveCategoryRequest(
    [Required, MaxLength(Category.NameMaxLength)] string Name,
    [MaxLength(20_000)] string? Rules);

public record CreateVariableRequest(
    [Required, MaxLength(Variable.NameMaxLength)] string Name,
    bool IsSubcategory,
    bool IsRequired);

public record CreateValueRequest(
    [Required, MaxLength(VariableValue.ValueMaxLength)] string Value);

/// <summary>A selectable option on a category variable, for building filter pills and forms.</summary>
public record RecordsValueDto(Guid Id, string Value);

public record RecordsVariableDto(
    Guid Id,
    string Name,
    bool IsSubcategory,
    bool IsRequired,
    IReadOnlyList<RecordsValueDto> Values);

public record RecordsCategoryDto(
    Guid Id,
    string Name,
    string? Rules,
    IReadOnlyList<RecordsVariableDto> Variables);

/// <summary>Everything the /records/[gameId] page needs besides the board rows.</summary>
public record GameRecordsDto(
    Guid GameId,
    string Title,
    string? Thumb,
    IReadOnlyList<RecordsCategoryDto> Categories,
    IReadOnlyList<ModeratorDto> Moderators);

/// <summary>One row on a verified speedrun leaderboard.</summary>
public record RecordRowDto(
    int Rank,
    Guid SubmissionId,
    Guid PlayerId,
    string PlayerName,
    long PrimaryTimeMs,
    DateTimeOffset PlayedOn,
    bool IsEmulator,
    string VideoUrl,
    string? ExaminerName,
    IReadOnlyList<SubmissionVariableDto> Variables);
