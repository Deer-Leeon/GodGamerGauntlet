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
    /// Position in RAWG's most-added ordering (0 = curated staple). The default
    /// sinks anything ingested before this field existed to the bottom.
    /// </summary>
    public int PopularityRank { get; set; } = 999999;
}
