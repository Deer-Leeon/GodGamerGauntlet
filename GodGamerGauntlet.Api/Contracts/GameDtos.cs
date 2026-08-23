using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record CreateGameRequest(
    [Required, MaxLength(200)] string Title,
    [Range(1, 100)] int BaseDifficulty);

public record GameResponse(Guid Id, string Title, int BaseDifficulty)
{
    public static GameResponse FromEntity(Game game) =>
        new(game.Id, game.Title, game.BaseDifficulty);
}
