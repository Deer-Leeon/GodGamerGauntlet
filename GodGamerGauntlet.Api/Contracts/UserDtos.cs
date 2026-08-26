using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;

namespace GodGamerGauntlet.Api.Contracts;

public record UserResponse(Guid Id, string Username, DateTime CreatedAt)
{
    public static UserResponse FromEntity(User user) =>
        new(user.Id, user.Username, user.CreatedAt);
}

/// <summary>The signed-in account. Email is never shown on public profiles.</summary>
public record AccountDto(
    Guid Id,
    string Username,
    string? Email,
    DateTime CreatedAt,
    bool NeedsUsername)
{
    public static AccountDto FromEntity(User user) =>
        new(
            user.Id,
            user.Username,
            user.Email,
            user.CreatedAt,
            AccountRules.NeedsPublicUsername(user));
}
