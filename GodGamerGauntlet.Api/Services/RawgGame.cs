using System.Text.Json.Serialization;

namespace GodGamerGauntlet.Api.Services;

/// <summary>One game from GET api.rawg.io/api/games.</summary>
public class RawgGame
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("background_image")]
    public string? BackgroundImage { get; set; }

    [JsonPropertyName("metacritic")]
    public int? Metacritic { get; set; }
}

/// <summary>Paged envelope returned by the RAWG games endpoint.</summary>
public class RawgGamesResponse
{
    [JsonPropertyName("results")]
    public List<RawgGame> Results { get; set; } = [];

    [JsonPropertyName("next")]
    public string? Next { get; set; }
}
