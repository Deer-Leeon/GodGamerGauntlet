using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Models;

public class Game
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    [Range(1, 100)]
    public int BaseDifficulty { get; set; }
}
