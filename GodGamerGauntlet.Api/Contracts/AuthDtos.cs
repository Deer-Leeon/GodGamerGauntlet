using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Contracts;

public record RegisterRequest(
    [Required, MinLength(3), MaxLength(50)] string Username,
    [Required, MinLength(8), MaxLength(100)] string Password);

public record LoginRequest(
    [Required] string Username,
    [Required] string Password);

public record AuthResponse(string Token, UserResponse User);
