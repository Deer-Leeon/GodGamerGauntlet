using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record CreateUserRequest(
    [Required, MinLength(3), MaxLength(50)] string Username);

public record UserResponse(Guid Id, string Username, DateTime CreatedAt)
{
    public static UserResponse FromEntity(User user) =>
        new(user.Id, user.Username, user.CreatedAt);
}
