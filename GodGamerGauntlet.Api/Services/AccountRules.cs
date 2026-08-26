using System.Net.Mail;
using System.Text.RegularExpressions;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Public handles stay usernames; email is a private login/contact field.
/// </summary>
public static class AccountRules
{
    public const int UsernameMin = 3;
    public const int UsernameMax = 24;
    public const int EmailMax = 254;

    private static readonly Regex UsernamePattern = new(
        @"^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static bool LooksLikeEmail(string value) =>
        value.Contains('@', StringComparison.Ordinal);

    public static bool TryNormalizeUsername(string raw, out string username, out string error)
    {
        username = raw.Trim();
        if (LooksLikeEmail(username))
        {
            error = "Username can't be an email. Pick a public handle.";
            return false;
        }

        if (username.Length < UsernameMin || username.Length > UsernameMax
            || !UsernamePattern.IsMatch(username))
        {
            error =
                "Username must be 3–24 characters, start with a letter or number, and use only letters, numbers, . _ or -.";
            return false;
        }

        error = "";
        return true;
    }

    public static bool TryNormalizeEmail(string raw, out string email, out string error)
    {
        email = raw.Trim().ToLowerInvariant();
        if (email.Length is 0 or > EmailMax)
        {
            error = "Enter a valid email address.";
            return false;
        }

        try
        {
            var parsed = new MailAddress(email);
            if (!parsed.Address.Equals(email, StringComparison.OrdinalIgnoreCase)
                || !email.Contains('.', StringComparison.Ordinal))
            {
                error = "Enter a valid email address.";
                return false;
            }
        }
        catch (FormatException)
        {
            error = "Enter a valid email address.";
            return false;
        }

        error = "";
        return true;
    }

    public static bool NeedsPublicUsername(User user) => LooksLikeEmail(user.Username);
}
