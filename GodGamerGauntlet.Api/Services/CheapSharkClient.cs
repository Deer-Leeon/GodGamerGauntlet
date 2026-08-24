using System.Net.Http.Json;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Typed client for the CheapShark REST API. All CheapShark traffic goes through
/// the backend so the browser never talks to CheapShark directly.
/// </summary>
public class CheapSharkClient(HttpClient httpClient)
{
    private const int SteamStoreId = 1;

    /// <summary>
    /// One page (up to 60 deals) of Steam deals ordered by review volume.
    /// Returns an empty list once CheapShark's pagination cap is reached
    /// (the API answers "400 Too Many Results" past page 50, ~3,060 deals).
    /// Note: CheapShark's Reviews sort is descending by default; passing desc=1
    /// inverts it and returns the *least* reviewed games, so it is omitted.
    /// </summary>
    public async Task<IReadOnlyList<CheapSharkDeal>> GetTopReviewedDealsAsync(
        int pageNumber,
        CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.GetAsync(
            $"api/1.0/deals?storeID={SteamStoreId}&sortBy=Reviews&pageSize=60&pageNumber={pageNumber}",
            cancellationToken);

        if (response.StatusCode == System.Net.HttpStatusCode.BadRequest)
        {
            // End of the paginable window — not an error; the caller stops looping.
            return [];
        }

        response.EnsureSuccessStatusCode();
        var deals = await response.Content.ReadFromJsonAsync<List<CheapSharkDeal>>(cancellationToken);
        return deals ?? [];
    }
}
