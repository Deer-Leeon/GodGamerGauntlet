using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>
/// Board management: categories, variables, and values are the rules engine
/// that moderators own. Every write requires the caller to be a global admin
/// or an assigned GameModerator for the board's game.
/// </summary>
[ApiController]
[Route("api")]
[Authorize]
public class CategoriesController(AppDbContext context) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    private async Task<bool> CanManageAsync(Guid gameId, CancellationToken cancellationToken) =>
        await context.Users
            .AsNoTracking()
            .AnyAsync(u => u.Id == CurrentUserId && u.IsAdmin, cancellationToken)
        || await context.GameModerators
            .AsNoTracking()
            .AnyAsync(m => m.GameId == gameId && m.UserId == CurrentUserId, cancellationToken);

    [HttpPost("games/{gameId:guid}/categories")]
    [ProducesResponseType(typeof(RecordsCategoryDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateCategory(
        Guid gameId, SaveCategoryRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        if (name.Length == 0) return BadRequest("Category name is required.");

        var gameExists = await context.Games.AnyAsync(g => g.Id == gameId, cancellationToken);
        if (!gameExists) return NotFound("Game not found.");

        if (!await CanManageAsync(gameId, cancellationToken)) return Forbid();

        var duplicate = await context.Categories
            .AnyAsync(c => c.GameId == gameId && c.Name == name, cancellationToken);
        if (duplicate) return Conflict($"This game already has a '{name}' category.");

        var category = new Category
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            Name = name,
            Rules = NormalizeRules(request.Rules),
            CreatedAt = DateTime.UtcNow,
        };
        context.Categories.Add(category);
        await context.SaveChangesAsync(cancellationToken);

        return StatusCode(StatusCodes.Status201Created, ToDto(category));
    }

    [HttpPut("categories/{categoryId:guid}")]
    [ProducesResponseType(typeof(RecordsCategoryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> UpdateCategory(
        Guid categoryId, SaveCategoryRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        if (name.Length == 0) return BadRequest("Category name is required.");

        var category = await context.Categories
            .Include(c => c.Variables)
            .ThenInclude(v => v.Values)
            .FirstOrDefaultAsync(c => c.Id == categoryId, cancellationToken);
        if (category is null) return NotFound();

        if (!await CanManageAsync(category.GameId, cancellationToken)) return Forbid();

        var duplicate = await context.Categories.AnyAsync(
            c => c.GameId == category.GameId && c.Name == name && c.Id != categoryId,
            cancellationToken);
        if (duplicate) return Conflict($"This game already has a '{name}' category.");

        category.Name = name;
        category.Rules = NormalizeRules(request.Rules);
        await context.SaveChangesAsync(cancellationToken);

        return Ok(ToDto(category));
    }

    [HttpPost("categories/{categoryId:guid}/variables")]
    [ProducesResponseType(typeof(RecordsVariableDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateVariable(
        Guid categoryId, CreateVariableRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        if (name.Length == 0) return BadRequest("Variable name is required.");

        var category = await context.Categories
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == categoryId, cancellationToken);
        if (category is null) return NotFound();

        if (!await CanManageAsync(category.GameId, cancellationToken)) return Forbid();

        var duplicate = await context.Variables
            .AnyAsync(v => v.CategoryId == categoryId && v.Name == name, cancellationToken);
        if (duplicate) return Conflict($"This category already has a '{name}' variable.");

        var variable = new Variable
        {
            Id = Guid.NewGuid(),
            CategoryId = categoryId,
            Name = name,
            IsSubcategory = request.IsSubcategory,
            IsRequired = request.IsRequired,
        };
        context.Variables.Add(variable);
        await context.SaveChangesAsync(cancellationToken);

        return StatusCode(StatusCodes.Status201Created, new RecordsVariableDto(
            variable.Id, variable.Name, variable.IsSubcategory, variable.IsRequired, []));
    }

    [HttpPost("variables/{variableId:guid}/values")]
    [ProducesResponseType(typeof(RecordsValueDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateValue(
        Guid variableId, CreateValueRequest request, CancellationToken cancellationToken)
    {
        var value = request.Value.Trim();
        if (value.Length == 0) return BadRequest("Value text is required.");

        var variable = await context.Variables
            .AsNoTracking()
            .Include(v => v.Category)
            .FirstOrDefaultAsync(v => v.Id == variableId, cancellationToken);
        if (variable is null) return NotFound();

        if (!await CanManageAsync(variable.Category!.GameId, cancellationToken)) return Forbid();

        var duplicate = await context.VariableValues
            .AnyAsync(x => x.VariableId == variableId && x.Value == value, cancellationToken);
        if (duplicate) return Conflict($"This variable already has a '{value}' option.");

        var variableValue = new VariableValue
        {
            Id = Guid.NewGuid(),
            VariableId = variableId,
            Value = value,
        };
        context.VariableValues.Add(variableValue);
        await context.SaveChangesAsync(cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            new RecordsValueDto(variableValue.Id, variableValue.Value));
    }

    private static string? NormalizeRules(string? rules) =>
        string.IsNullOrWhiteSpace(rules) ? null : rules.Trim();

    private static RecordsCategoryDto ToDto(Category category) =>
        new(
            category.Id,
            category.Name,
            category.Rules,
            category.Variables
                .OrderBy(v => v.Name)
                .Select(v => new RecordsVariableDto(
                    v.Id,
                    v.Name,
                    v.IsSubcategory,
                    v.IsRequired,
                    v.Values.OrderBy(x => x.Value).Select(x => new RecordsValueDto(x.Id, x.Value)).ToList()))
                .ToList());
}
