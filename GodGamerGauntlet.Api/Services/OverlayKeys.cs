using System.Security.Cryptography;
using System.Text;

namespace GodGamerGauntlet.Api.Services;

/// <summary>Per-run secrets that let the OBS overlay control the run without a login.</summary>
public static class OverlayKeys
{
    public static string Create() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    public static bool Matches(string? stored, string? provided)
    {
        if (string.IsNullOrEmpty(stored) || string.IsNullOrEmpty(provided))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(stored),
            Encoding.UTF8.GetBytes(provided));
    }
}
