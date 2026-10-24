using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Models;

public class Game
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    [Range(1, 100)]
    public int BaseDifficulty { get; set; }

    /// <summary>RAWG game id for ingested games.</summary>
    public string? ExternalId { get; set; }

    /// <summary>Cover image URL.</summary>
    public string? Thumb { get; set; }

    /// <summary>RAWG does not track storefront pricing, so prices are optional.</summary>
    public decimal? NormalPrice { get; set; }

    public decimal? SalePrice { get; set; }

    /// <summary>
    /// Curated competitive staple, pinned above the RAWG catalog. Set by the
    /// seeder only; the RAWG sync must never clear it.
    /// </summary>
    public bool IsFeatured { get; set; } = false;

    /// <summary>
    /// Catalog display order. All-time chart position, or 100 plus the active-chart
    /// position for games that are not in the all-time hundred.
    /// </summary>
    public int PopularityRank { get; set; } = 999999;

    /// <summary>1-based place on speedrun.com's most-runs chart. Null when the game is only on the active chart.</summary>
    public int? AllTimeRank { get; set; }

    /// <summary>1-based place on speedrun.com's most-active chart. Null when the game is only on the all-time chart.</summary>
    public int? RecentRank { get; set; }
}
