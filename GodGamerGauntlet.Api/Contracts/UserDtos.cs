using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record UserResponse(Guid Id, string Username, DateTime CreatedAt)
{
    public static UserResponse FromEntity(User user) =>
        new(user.Id, user.Username, user.CreatedAt);
}
