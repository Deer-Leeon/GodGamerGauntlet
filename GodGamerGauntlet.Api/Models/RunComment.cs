namespace GodGamerGauntlet.Api.Models;

/// <summary>Flat (non-nested) comment on a finished run.</summary>
public class RunComment
{
    public Guid Id { get; set; }

    public Guid RunId { get; set; }

    public Run? Run { get; set; }

    public Guid UserId { get; set; }

    public User? User { get; set; }

    public required string Body { get; set; }

    public DateTime CreatedAt { get; set; }
}
