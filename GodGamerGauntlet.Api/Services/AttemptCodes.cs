using System.Security.Cryptography;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// Short public id for the current gauntlet attempt. Regenerated on reset so
/// the overlay, phone dock, and run page can be matched at a glance.
/// </summary>
public static class AttemptCodes
{
    public const int Length = 6;
    public const int MaxLength = 8;

    // No 0/O/1/I — these are read off a stream overlay and a phone.
    private const string Alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    public static string Create()
    {
        Span<byte> bytes = stackalloc byte[Length];
        RandomNumberGenerator.Fill(bytes);
        Span<char> chars = stackalloc char[Length];
        for (var i = 0; i < Length; i++)
        {
            chars[i] = Alphabet[bytes[i] % Alphabet.Length];
        }
        return new string(chars);
    }
}
