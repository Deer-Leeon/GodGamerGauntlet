using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Models;

public class Game
{
    public Guid Id { get; set; }

    public required string Title { get; set; }

    [Range(1, 100)]
    public int BaseDifficulty { get; set; }

    /// <summary>RAWG game id for ingested games; null for hand-seeded catalog entries.</summary>
    public string? ExternalId { get; set; }

    /// <summary>Cover image URL.</summary>
    public string? Thumb { get; set; }

    /// <summary>RAWG does not track storefront pricing, so prices are optional.</summary>
    public decimal? NormalPrice { get; set; }

    public decimal? SalePrice { get; set; }
}
