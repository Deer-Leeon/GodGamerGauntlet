using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;

namespace GodGamerGauntlet.Api.Contracts;

public record UserResponse(Guid Id, string Username, DateTime CreatedAt)
{
    public static UserResponse FromEntity(User user) =>
        new(user.Id, user.Username, user.CreatedAt);
}

public record StreamLinkDto(string Platform, string Url, string Label)
{
    public static IReadOnlyList<StreamLinkDto> FromUser(User? user) =>
        user?.StreamLinks is { Count: > 0 } links
            ? links
                .OrderBy(l => l.SortOrder)
                .Select(l => new StreamLinkDto(
                    l.Platform,
                    l.Url,
                    StreamLinkRules.Label(l.Platform, l.Url)))
                .ToList()
            : [];
}

/// <summary>The signed-in account. Email is never shown on public profiles.</summary>
public record AccountDto(
    Guid Id,
    string Username,
    string? Email,
    DateTime CreatedAt,
    bool NeedsUsername,
    bool IsAdmin,
    bool IsModerator,
    string? AvatarUrl,
    IReadOnlyList<StreamLinkDto> StreamLinks,
    bool IsReserved,
    string? SrcUserId,
    string? DisplayName)
{
    /// <param name="isModerator">Whether the user has any GameModerator assignment.</param>
    public static AccountDto FromEntity(User user, bool isModerator = false) =>
        new(
            user.Id,
            user.Username,
            user.Email,
            user.CreatedAt,
            AccountRules.NeedsPublicUsername(user),
            user.IsAdmin,
            isModerator,
            user.AvatarUrl,
            StreamLinkDto.FromUser(user),
            user.IsReserved,
            user.SrcUserId,
            user.DisplayName);
}

/// <summary>Settings payload: avatar only. Stream URLs live in StreamLinks.</summary>
public record UpdateProfileRequest(string? AvatarUrl);
