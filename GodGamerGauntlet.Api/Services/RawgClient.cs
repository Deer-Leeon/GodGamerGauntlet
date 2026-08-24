using System.Net;
using System.Net.Http.Json;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Typed client for the RAWG Video Games Database API. All RAWG traffic goes
/// through the backend so the browser never talks to RAWG directly.
/// Requires the "RawgApiKey" configuration value (environment variable in prod).
/// </summary>
public class RawgClient(HttpClient httpClient, IConfiguration configuration)
{
    private readonly string _apiKey = configuration["RawgApiKey"] ?? "";

    /// <summary>False when no API key is configured; the sync skips entirely.</summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    /// <summary>
    /// One page (up to 40 games) of the most-added games across all platforms.
    /// Returns an empty list past the last available page (RAWG answers 404
    /// "Invalid page.") so callers can stop looping gracefully.
    /// </summary>
    public async Task<IReadOnlyList<RawgGame>> GetTopGamesAsync(
        int pageNumber,
        CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync(
            $"api/games?key={_apiKey}&page={pageNumber}&page_size=40&ordering=-added",
            cancellationToken);

        if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.BadRequest)
        {
            // End of the paginable window — not an error; the caller stops looping.
            return [];
        }

        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadFromJsonAsync<RawgGamesResponse>(cancellationToken);
        return payload?.Results ?? [];
    }
}
