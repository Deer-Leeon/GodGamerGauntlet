using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Contracts;

public record RegisterRequest(
    [Required, MinLength(3), MaxLength(24)] string Username,
    [Required, MaxLength(254)] string Email,
    [Required, MinLength(8), MaxLength(100)] string Password);

public record LoginRequest(
    [Required] string Username,
    [Required] string Password);

public record ChangeUsernameRequest(
    [Required, MinLength(3), MaxLength(24)] string Username);

public record ChangeEmailRequest(
    [Required, MaxLength(254)] string Email,
    [Required] string CurrentPassword);

public record ChangePasswordRequest(
    [Required] string CurrentPassword,
    [Required, MinLength(8), MaxLength(100)] string NewPassword);

public record StreamLinkInput(
    [Required] string Platform,
    [Required, MaxLength(500)] string Url);

public record ChangeStreamLinksRequest(
    [Required] List<StreamLinkInput> Links);

public record AuthResponse(string Token, AccountDto User);
