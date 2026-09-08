using System.Text.RegularExpressions;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// YouTube and Twitch proof URLs. Examiners (and the overlay player) only
/// embed these two hosts; nicovideo/vimeo/hitbox are skipped on import.
/// </summary>
public static partial class ProofUrls
{
    [GeneratedRegex(
        @"^https://(www\.|m\.)?(youtube\.com/(watch\?|live/|shorts/)|youtu\.be/|twitch\.tv/(videos/\d+|\w+/(v|video)/\d+|\w+/clip/)|clips\.twitch\.tv/)\S+$",
        RegexOptions.IgnoreCase)]
    private static partial Regex VideoUrlRegex();

    public static bool IsAccepted(string url) => VideoUrlRegex().IsMatch(url);

    /// <summary>
    /// Picks the first YouTube or Twitch link and normalizes it to https
    /// without a trailing slash. Returns null when nothing embeddable exists.
    /// </summary>
    public static string? FirstAccepted(IEnumerable<string?> candidates)
    {
        foreach (var raw in candidates)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            if (!Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var uri)) continue;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) continue;

            var builder = new UriBuilder(uri) { Scheme = "https", Port = -1 };
            var https = builder.Uri.ToString().TrimEnd('/');
            if (https.Length > 500) continue;
            if (IsAccepted(https)) return https;
        }

        return null;
    }
}
