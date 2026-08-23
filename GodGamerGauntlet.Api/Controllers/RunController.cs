using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/runs")]
public class RunController(IRunRepository runRepository, IGameRepository gameRepository) : ControllerBase
{
    private const int RequiredSlotCount = 10;

    [HttpPost("initialize")]
    [ProducesResponseType(typeof(RunResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Initialize(InitializeRunRequest request, CancellationToken cancellationToken)
    {
        if (request.GameIds.Count != RequiredSlotCount)
        {
            return BadRequest($"Exactly {RequiredSlotCount} game ids are required, ordered by slot position.");
        }

        if (!await runRepository.UserExistsAsync(request.UserId, cancellationToken))
        {
            return BadRequest($"User '{request.UserId}' does not exist.");
        }

        var games = await gameRepository.GetByIdsAsync(request.GameIds, cancellationToken);
        var gamesById = games.ToDictionary(g => g.Id);

        var missingIds = request.GameIds.Where(id => !gamesById.ContainsKey(id)).Distinct().ToList();
        if (missingIds.Count > 0)
        {
            return BadRequest($"Unknown game ids: {string.Join(", ", missingIds)}.");
        }

        var run = new Run
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            StartTime = DateTime.UtcNow,
            Status = RunStatus.Active
        };

        double totalDifficultyScore = 0;

        for (var index = 0; index < request.GameIds.Count; index++)
        {
            var position = index + 1;
            var game = gamesById[request.GameIds[index]];

            totalDifficultyScore += game.BaseDifficulty * (1 + 0.1 * Math.Pow(position - 1, 2));

            run.Slots.Add(new RunSlot
            {
                Id = Guid.NewGuid(),
                RunId = run.Id,
                GameId = game.Id,
                Position = position,
                Status = RunSlotStatus.Pending
            });
        }

        run.TotalDifficultyScore = totalDifficultyScore;

        await runRepository.AddAsync(run, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = run.Id }, RunResponse.FromEntity(run));
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(RunResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var run = await runRepository.GetByIdAsync(id, cancellationToken);
        return run is null ? NotFound() : Ok(RunResponse.FromEntity(run));
    }
}
