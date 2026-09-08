using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace GodGamerGauntlet.Api.Services.Src;

/// <summary>
/// Shared 80 req/min gate for every SRC HTTP call. Typed <see cref="SrcClient"/>
/// instances are transient; this limiter is a singleton.
/// </summary>
public sealed class SrcRateLimiter
{
    public const int MaxPerMinute = 80;

    private readonly SemaphoreSlim _mutex = new(1, 1);
    private readonly Queue<long> _stamps = new();

    public async Task WaitAsync(CancellationToken cancellationToken)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            while (true)
            {
                var now = DateTime.UtcNow.Ticks;
                var window = TimeSpan.FromMinutes(1).Ticks;
                while (_stamps.Count > 0 && now - _stamps.Peek() > window)
                {
                    _stamps.Dequeue();
                }

                if (_stamps.Count < MaxPerMinute)
                {
                    _stamps.Enqueue(now);
                    return;
                }

                var waitTicks = window - (now - _stamps.Peek()) + TimeSpan.FromMilliseconds(50).Ticks;
                _mutex.Release();
                try
                {
                    await Task.Delay(TimeSpan.FromTicks(Math.Max(waitTicks, 0)), cancellationToken);
                }
                finally
                {
                    await _mutex.WaitAsync(cancellationToken);
                }
            }
        }
        finally
        {
            _mutex.Release();
        }
    }
}

public sealed class SrcClient(HttpClient http, SrcRateLimiter limiter) : ISrcClient
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public async Task<SrcGame?> GetGameAsync(
        string idOrAbbreviation, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(
            $"games/{Uri.EscapeDataString(idOrAbbreviation)}?embed=categories,variables",
            apiKey: null,
            cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<SrcDataEnvelope<SrcGame>>(Json, cancellationToken);
        return envelope?.Data;
    }

    public async Task<SrcLeaderboard?> GetLeaderboardAsync(
        string gameId,
        string categoryId,
        IReadOnlyDictionary<string, string>? variableFilters,
        CancellationToken cancellationToken = default)
    {
        var query = new List<string> { "embed=players" };
        if (variableFilters is not null)
        {
            foreach (var (variableId, valueId) in variableFilters)
            {
                query.Add($"var-{Uri.EscapeDataString(variableId)}={Uri.EscapeDataString(valueId)}");
            }
        }

        using var response = await SendAsync(
            $"leaderboards/{Uri.EscapeDataString(gameId)}/category/{Uri.EscapeDataString(categoryId)}?{string.Join('&', query)}",
            apiKey: null,
            cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<SrcDataEnvelope<SrcLeaderboard>>(Json, cancellationToken);
        return envelope?.Data;
    }

    public async Task<SrcUser?> GetProfileAsync(
        string apiKey, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync("profile", apiKey, cancellationToken);
        if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<SrcDataEnvelope<SrcUser>>(Json, cancellationToken);
        return envelope?.Data;
    }

    public async Task<IReadOnlyList<SrcPersonalBest>> GetPersonalBestsAsync(
        string srcUserId, CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(
            $"users/{Uri.EscapeDataString(srcUserId)}/personal-bests",
            apiKey: null,
            cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound) return [];
        response.EnsureSuccessStatusCode();
        var envelope = await response.Content.ReadFromJsonAsync<SrcDataEnvelope<List<SrcPersonalBest>>>(Json, cancellationToken);
        return envelope?.Data ?? [];
    }

    private async Task<HttpResponseMessage> SendAsync(
        string relativeUrl, string? apiKey, CancellationToken cancellationToken)
    {
        HttpResponseMessage? last = null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            last?.Dispose();
            await limiter.WaitAsync(cancellationToken);

            using var request = new HttpRequestMessage(HttpMethod.Get, relativeUrl);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            if (!string.IsNullOrWhiteSpace(apiKey))
            {
                request.Headers.TryAddWithoutValidation("X-API-Key", apiKey.Trim());
            }

            last = await http.SendAsync(request, cancellationToken);
            if ((int)last.StatusCode != 420)
            {
                return last;
            }

            var delay = TimeSpan.FromSeconds(2 * (attempt + 1));
            if (last.Headers.RetryAfter?.Delta is TimeSpan retryAfter && retryAfter > delay)
            {
                delay = retryAfter;
            }

            last.Dispose();
            last = null;
            await Task.Delay(delay, cancellationToken);
        }

        return last ?? throw new HttpRequestException("speedrun.com rate limit (HTTP 420) persisted.");
    }
}
