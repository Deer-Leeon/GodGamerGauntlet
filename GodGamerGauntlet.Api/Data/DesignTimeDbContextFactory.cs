using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace GodGamerGauntlet.Api.Data;

/// <summary>
/// Builds an <see cref="AppDbContext"/> for the EF Core CLI without booting the
/// web host. Design-time commands (migrations add/script) only need the
/// provider, not a live server, so an unreachable connection string is fine.
///
/// EF still *probes* the entry point first, and Program.cs migrates/seeds at
/// startup — against an unreachable database that probe burns the full 5-minute
/// host-resolver timeout before falling back here. To skip the wait:
///
///     DOTNET_HOST_FACTORY_RESOLVER_DEFAULT_TIMEOUT_IN_SECONDS=1 dotnet ef ...
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    private const string FallbackConnection =
        "Host=localhost;Port=5432;Database=godgamergauntlet;Username=postgres;Password=postgres";

    public AppDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddUserSecrets<DesignTimeDbContextFactory>(optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString =
            configuration.GetConnectionString("DefaultConnection") ?? FallbackConnection;

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new AppDbContext(options);
    }
}
