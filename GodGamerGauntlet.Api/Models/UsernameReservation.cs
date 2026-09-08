namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// Audit trail for a reserved SRC handle: when it was locked, and how it was
/// later given to a verified claimant (API key or admin grant).
/// </summary>
public class UsernameReservation
{
    public const int UsernameMaxLength = 50;
    public const int SrcIdMaxLength = 16;
    public const int GuestNameMaxLength = 100;
    public const int ClaimMethodMaxLength = 20;

    public const string MethodApiKey = "ApiKey";
    public const string MethodAdminGrant = "AdminGrant";

    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public required string ReservedUsername { get; set; }

    public string? SrcUserId { get; set; }

    public string? GuestName { get; set; }

    public DateTime ReservedAt { get; set; }

    public DateTime? ClaimedAt { get; set; }

    public Guid? ClaimedByUserId { get; set; }

    public string? ClaimMethod { get; set; }

    public User? User { get; set; }
}
