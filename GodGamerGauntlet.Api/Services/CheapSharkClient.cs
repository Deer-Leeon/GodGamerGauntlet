using System.Net.Http.Json;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Typed client for the CheapShark REST API. All CheapShark traffic goes through
/// the backend so the browser never talks to CheapShark directly.
/// </summary>
public class CheapSharkClient(HttpClient httpClient)
{
    private const int SteamStoreId = 1;

    /// <summary>Fetches one page (up to 60 deals) of Steam deals.</summary>
    public async Task<IReadOnlyList<CheapSharkDeal>> GetSteamDealsPageAsync(
        int pageNumber,
        CancellationToken cancellationToken = default)
    {
        var deals = await httpClient.GetFromJsonAsync<List<CheapSharkDeal>>(
            $"api/1.0/deals?storeID={SteamStoreId}&pageNumber={pageNumber}&pageSize=60",
            cancellationToken);

        return deals ?? [];
    }
}
