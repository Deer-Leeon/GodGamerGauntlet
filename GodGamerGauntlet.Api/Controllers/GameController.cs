using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/games")]
public class GameController(IGameRepository gameRepository) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<GameResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var games = await gameRepository.GetAllAsync(cancellationToken);
        return Ok(games.Select(GameResponse.FromEntity));
    }

    [HttpPost]
    [ProducesResponseType(typeof(GameResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create(CreateGameRequest request, CancellationToken cancellationToken)
    {
        var game = new Game
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            BaseDifficulty = request.BaseDifficulty
        };

        await gameRepository.AddAsync(game, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = game.Id }, GameResponse.FromEntity(game));
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(GameResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var game = await gameRepository.GetByIdAsync(id, cancellationToken);
        return game is null ? NotFound() : Ok(GameResponse.FromEntity(game));
    }
}
