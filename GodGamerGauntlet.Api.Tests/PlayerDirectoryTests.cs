using System.Net.Http.Json;
using System.Text.Json;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

public class PlayerDirectoryTests : IClassFixture<CourtApiFactory>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly CourtApiFactory _factory;

    public PlayerDirectoryTests(CourtApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Directory_lists_accounts_and_search_finds_a_reserved_runner()
    {
        var reserved = $"held{Guid.NewGuid():N}"[..12];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Users.Add(new User
            {
                Id = Guid.NewGuid(),
                Username = reserved,
                CreatedAt = DateTime.UtcNow,
                IsReserved = true,
            });
            await db.SaveChangesAsync();
        }

        var client = _factory.CreateClient();
        var listed = await client.GetFromJsonAsync<PlayerRow[]>("/api/users", Json);
        Assert.NotNull(listed);
        Assert.DoesNotContain(listed, row => row.Username == reserved);
        Assert.Contains(listed, row => row.Username == "GodGamerDemo");

        var tooShort = await client.GetFromJsonAsync<PlayerRow[]>("/api/users?q=a", Json);
        Assert.NotNull(tooShort);
        Assert.Empty(tooShort);

        var found = await client.GetFromJsonAsync<PlayerRow[]>(
            $"/api/users?q={reserved}", Json);
        Assert.NotNull(found);
        Assert.Contains(found, row => row.Username == reserved);
    }

    private sealed record PlayerRow(string Username);
}
