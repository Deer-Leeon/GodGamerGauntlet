using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using GodGamerGauntlet.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace GodGamerGauntlet.Api.Services;

/// <summary>Issues the JWTs the SPA stores and sends as Bearer tokens.</summary>
public class JwtTokenService(SymmetricSecurityKey signingKey)
{
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromDays(30);

    public string CreateToken(User user)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username)
        };

        var token = new JwtSecurityToken(
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.Add(TokenLifetime),
            signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
