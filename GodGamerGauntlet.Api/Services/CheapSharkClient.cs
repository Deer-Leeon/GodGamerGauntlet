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
    /// AAA titles sorted by review volume — the recognizable big hits.
    /// Note: CheapShark's Reviews sort is descending by default; passing desc=1
    /// inverts it and returns the *least* reviewed games, so it is omitted.
    /// </summary>
    public Task<IReadOnlyList<CheapSharkDeal>> GetAaaHitsAsync(CancellationToken cancellationToken = default) =>
        GetDealsAsync($"api/1.0/deals?storeID={SteamStoreId}&AAA=1&sortBy=Reviews&pageSize=60", cancellationToken);

    /// <summary>Critically acclaimed games: Metacritic 80+, at least 1000 Steam reviews.</summary>
    public Task<IReadOnlyList<CheapSharkDeal>> GetHighlyRatedAsync(CancellationToken cancellationToken = default) =>
        GetDealsAsync($"api/1.0/deals?storeID={SteamStoreId}&metacritic=80&minimumReviewCount=1000&sortBy=DealRating&pageSize=60", cancellationToken);

    private async Task<IReadOnlyList<CheapSharkDeal>> GetDealsAsync(string requestUri, CancellationToken cancellationToken)
    {
        var deals = await httpClient.GetFromJsonAsync<List<CheapSharkDeal>>(requestUri, cancellationToken);
        return deals ?? [];
    }
}
