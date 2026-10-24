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

        var seed = new string(disambiguator.Where(char.IsAsciiLetterOrDigit).Take(8).ToArray());
        if (seed.Length < 4) seed = Guid.NewGuid().ToString("N")[..8];
        var stemSource = preferred is "src" or "srcplayer" ? "runner" : preferred;

        for (var i = 0; i < 30; i++)
        {
            var suffix = i == 0 ? seed : seed + i.ToString();
            if (suffix.Length > 10) suffix = suffix[..10];
            var room = AccountRules.UsernameMax - suffix.Length - 1;
            if (room < AccountRules.UsernameMin) continue;
            var stem = stemSource.Length <= room ? stemSource : stemSource[..room];
            if (!AccountRules.TryNormalizeUsername(stem + "_" + suffix, out var candidate, out _)) continue;
            if (!await TakenAsync(context, candidate, cancellationToken)) return candidate;
        }

        for (var i = 0; i < 5; i++)
        {
            var fallback = "u" + Guid.NewGuid().ToString("N")[..12];
            if (!await TakenAsync(context, fallback, cancellationToken)) return fallback;
        }

        throw new InvalidOperationException("Could not allocate a unique username.");
    }

    private static async Task<bool> TakenAsync(
        AppDbContext context, string username, CancellationToken cancellationToken)
    {
        if (context.ChangeTracker.Entries<User>().Any(entry =>
                string.Equals(entry.Entity.Username, username, StringComparison.OrdinalIgnoreCase)))
        {
            return true;
        }

        var key = username.ToLowerInvariant();
        return await context.Users.AnyAsync(
            u => u.Username == username || u.Username.ToLower() == key,
            cancellationToken);
    }
}
