using System.Text.Json.Serialization;

namespace GodGamerGauntlet.Api.Services;

/// <summary>One deal row from GET cheapshark.com/api/1.0/deals.</summary>
public class CheapSharkDeal
{
    [JsonPropertyName("gameID")]
    public string GameId { get; set; } = "";

    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("thumb")]
    public string? Thumb { get; set; }

    [JsonPropertyName("normalPrice")]
    public string NormalPrice { get; set; } = "0";

    [JsonPropertyName("salePrice")]
    public string SalePrice { get; set; } = "0";

    [JsonPropertyName("metacriticScore")]
    public string? MetacriticScore { get; set; }

    [JsonPropertyName("steamRatingPercent")]
    public string? SteamRatingPercent { get; set; }
}
