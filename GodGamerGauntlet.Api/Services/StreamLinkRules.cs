using System.Text.RegularExpressions;
using GodGamerGauntlet.Api.Contracts;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Public stream URLs must be https Twitch or YouTube links — nothing else.
/// </summary>
public static class StreamLinkRules
{
    public const int MaxLinks = 6;
    public const int UrlMax = 500;

    public const string Twitch = "twitch";
    public const string YouTube = "youtube";

    private static readonly HashSet<string> TwitchHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "twitch.tv",
        "www.twitch.tv",
        "m.twitch.tv",
    };

    private static readonly HashSet<string> YouTubeHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtu.be",
    };

    private static readonly Regex TwitchChannel = new(
        @"^[A-Za-z0-9_]{1,25}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static bool TryNormalize(
        IReadOnlyList<StreamLinkInput>? raw,
        out List<(string Platform, string Url)> links,
        out string error)
    {
        links = [];
        if (raw is null || raw.Count == 0)
        {
            error = "";
            return true;
        }

        if (raw.Count > MaxLinks)
        {
            error = $"You can save up to {MaxLinks} stream links.";
            return false;
        }

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in raw)
        {
            if (!TryNormalizeOne(item, out var platform, out var url, out error))
            {
                return false;
            }

            if (!seen.Add(url))
            {
                error = "Each stream link must be unique.";
                return false;
            }

            links.Add((platform, url));
        }

        error = "";
        return true;
    }

    public static string Label(string platform, string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return platform == Twitch ? "Twitch" : "YouTube";
        }

        if (platform == Twitch)
        {
            var channel = uri.AbsolutePath.Trim('/');
            return string.IsNullOrEmpty(channel) ? "Twitch" : $"Twitch · {channel}";
        }

        var handle = uri.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault(part => part.StartsWith('@'));
        return handle is null ? "YouTube" : $"YouTube · {handle}";
    }

    private static bool TryNormalizeOne(
        StreamLinkInput item,
        out string platform,
        out string url,
        out string error)
    {
        platform = "";
        url = "";
        var rawPlatform = (item.Platform ?? "").Trim().ToLowerInvariant();
        var rawUrl = (item.Url ?? "").Trim();

        if (rawPlatform is not (Twitch or YouTube))
        {
            error = "Each link must be Twitch or YouTube.";
            return false;
        }

        if (rawUrl.Length is 0 or > UrlMax)
        {
            error = "Paste a Twitch or YouTube live URL.";
            return false;
        }

        if (!rawUrl.Contains("://", StringComparison.Ordinal))
        {
            rawUrl = "https://" + rawUrl;
        }

        if (!Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            error = "Paste a full https:// Twitch or YouTube URL.";
            return false;
        }

        if (rawPlatform == Twitch)
        {
            if (!TryCanonicalTwitch(uri, out url, out error)) return false;
        }
        else if (!TryCanonicalYouTube(uri, out url, out error))
        {
            return false;
        }

        platform = rawPlatform;
        error = "";
        return true;
    }

    private static bool TryCanonicalTwitch(Uri uri, out string url, out string error)
    {
        url = "";
        if (!TwitchHosts.Contains(uri.Host))
        {
            error = "Twitch links have to be twitch.tv channel URLs.";
            return false;
        }

        var channel = uri.AbsolutePath.Trim('/');
        if (channel.Contains('/') || !TwitchChannel.IsMatch(channel))
        {
            error = "Twitch links have to be a channel, like twitch.tv/yourname.";
            return false;
        }

        url = $"https://www.twitch.tv/{channel.ToLowerInvariant()}";
        error = "";
        return true;
    }

    private static bool TryCanonicalYouTube(Uri uri, out string url, out string error)
    {
        url = "";
        if (!YouTubeHosts.Contains(uri.Host))
        {
            error = "YouTube links have to be youtube.com or youtu.be URLs.";
            return false;
        }

        if (uri.Host.Equals("youtu.be", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("www.youtu.be", StringComparison.OrdinalIgnoreCase))
        {
            var videoId = uri.AbsolutePath.Trim('/');
            if (videoId.Contains('/') || videoId.Length is < 6 or > 20)
            {
                error = "That YouTube short link doesn't look like a video.";
                return false;
            }

            url = $"https://www.youtube.com/watch?v={videoId}";
            error = "";
            return true;
        }

        var path = uri.AbsolutePath.TrimEnd('/');
        if (path.StartsWith("/watch", StringComparison.OrdinalIgnoreCase))
        {
            var videoId = QueryValue(uri.Query, "v");
            if (string.IsNullOrWhiteSpace(videoId) || videoId.Length is < 6 or > 20)
            {
                error = "YouTube watch links need a video id.";
                return false;
            }

            url = $"https://www.youtube.com/watch?v={videoId}";
            error = "";
            return true;
        }

        var segments = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length is 0 or > 3)
        {
            error = "Paste a YouTube channel or live URL.";
            return false;
        }

        var first = segments[0];
        var allowed =
            first.StartsWith('@')
            || first.Equals("live", StringComparison.OrdinalIgnoreCase)
            || first.Equals("channel", StringComparison.OrdinalIgnoreCase)
            || first.Equals("c", StringComparison.OrdinalIgnoreCase)
            || first.Equals("user", StringComparison.OrdinalIgnoreCase)
            || first.Equals("@", StringComparison.OrdinalIgnoreCase);

        if (!allowed)
        {
            error = "Paste a YouTube channel, handle, or live URL.";
            return false;
        }

        url = $"https://www.youtube.com{path}";
        error = "";
        return true;
    }

    private static string? QueryValue(string query, string key)
    {
        if (string.IsNullOrEmpty(query)) return null;
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2
                && parts[0].Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                return Uri.UnescapeDataString(parts[1]);
            }
        }

        return null;
    }
}
