namespace GodGamerGauntlet.Api.Contracts;

public record NotificationDto(
    Guid Id,
    string Message,
    string ActionUrl,
    bool IsRead,
    DateTime CreatedAt);
