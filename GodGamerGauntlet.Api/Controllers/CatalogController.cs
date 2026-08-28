using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>
/// Server-paginated view of the ~20k-game catalog. The Draft Room ships the
/// whole list to the client for instant search; the records directory can't
/// afford that, so it pages here instead.
/// </summary>
[ApiController]
[Route("api/catalog")]
public class CatalogController(AppDbContext context) : ControllerBase
{
    private const int MaxPageSize = 100;

    [HttpGet]
    [ProducesResponseType(typeof(CatalogPageDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 40,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(page, 1);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);

        var query = context.Games.AsNoTracking();

        var term = search?.Trim();
        if (!string.IsNullOrEmpty(term))
        {
            var lowered = term.ToLowerInvariant();
            query = query.Where(g => g.Title.ToLower().Contains(lowered));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = Math.Max((int)Math.Ceiling(totalCount / (double)pageSize), 1);
        page = Math.Min(page, totalPages);

        var items = await query
            .OrderByDescending(g => g.IsFeatured)
            .ThenBy(g => g.PopularityRank)
            .ThenBy(g => g.Title)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return Ok(new CatalogPageDto(
            items.Select(GameResponse.FromEntity).ToList(),
            totalCount,
            totalPages,
            page));
    }
}
