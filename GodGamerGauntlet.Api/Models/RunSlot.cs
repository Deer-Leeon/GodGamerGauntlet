using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Models;

public class RunSlot
{
    public Guid Id { get; set; }

    public Guid RunId { get; set; }

    public Run? Run { get; set; }

    public Guid GameId { get; set; }

    public Game? Game { get; set; }

    [Range(1, 10)]
    public int Position { get; set; }

    public RunSlotStatus Status { get; set; }
}
