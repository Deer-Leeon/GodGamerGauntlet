using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services.Src;

public static class SrcUsernames
{
    public const string ReservedMessage =
        "This name is reserved for a speedrun.com record holder. Create an account with a different handle, then claim it in Settings by proving you own that speedrun.com account.";

    public static string PublicName(User? user) =>
        user is null
            ? "unknown"
            : string.IsNullOrWhiteSpace(user.DisplayName)
                ? user.Username
                : user.DisplayName;

    public static string RunWeblink(string srcRunId) =>
        $"https://www.speedrun.com/run/{srcRunId}";

    public static string ToHandle(string srcName, string disambiguator)
    {
        var filtered = new string(srcName
            .Where(c => char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or '-')
            .ToArray());
        if (filtered.Length > 0 && !char.IsAsciiLetterOrDigit(filtered[0]))
        {
            filtered = "r" + filtered;
        }

        if (filtered.Length > AccountRules.UsernameMax)
        {
            filtered = filtered[..AccountRules.UsernameMax];
        }

        if (AccountRules.TryNormalizeUsername(filtered, out var handle, out _))
        {
            return handle;
        }

        var idPart = new string(disambiguator.Where(char.IsAsciiLetterOrDigit).Take(8).ToArray());
        var fallback = "src" + idPart;
        if (fallback.Length > AccountRules.UsernameMax)
        {
            fallback = fallback[..AccountRules.UsernameMax];
        }

        return AccountRules.TryNormalizeUsername(fallback, out var normalized, out _)
            ? normalized
            : "srcplayer";
    }

    public static bool NeedsDisplayName(string srcName, string handle) =>
        !srcName.Equals(handle, StringComparison.OrdinalIgnoreCase);

    public static async Task<string> AllocateHandleAsync(
        AppDbContext context,
        string srcName,
        string disambiguator,
        CancellationToken cancellationToken)
    {
        var preferred = ToHandle(srcName, disambiguator);
        if (!await TakenAsync(context, preferred, cancellationToken)) return preferred;

        var idPart = new string(disambiguator.Where(char.IsAsciiLetterOrDigit).Take(6).ToArray());
        var stem = preferred.Length > 18 ? preferred[..17] : preferred;
        var candidate = $"{stem}_{idPart}";
        if (candidate.Length > AccountRules.UsernameMax)
        {
            candidate = candidate[..AccountRules.UsernameMax];
        }

        if (AccountRules.TryNormalizeUsername(candidate, out var normalized, out _)
            && !await TakenAsync(context, normalized, cancellationToken))
        {
            return normalized;
        }

        for (var i = 0; i < 12; i++)
        {
            var stamped = ToHandle(srcName, disambiguator + i);
            if (!await TakenAsync(context, stamped, cancellationToken)) return stamped;
        }

        return ToHandle("src", Guid.NewGuid().ToString("N"));
    }

    private static Task<bool> TakenAsync(
        AppDbContext context, string username, CancellationToken cancellationToken)
    {
        var key = username.ToLower();
        return context.Users.AnyAsync(u => u.Username.ToLower() == key, cancellationToken);
    }
}
