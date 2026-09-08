using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace GodGamerGauntlet.Api.Tests;

/// <summary>
/// Boots the real HTTP pipeline (auth, controllers, validation) over a shared
/// in-memory SQLite database instead of Postgres. DbInitializer detects the
/// non-Npgsql provider and uses EnsureCreated instead of migrations.
/// </summary>
public class CourtApiFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();

        builder.UseSetting("Jwt:Secret", "integration-test-secret");
        builder.UseSetting("RawgApiKey", "");
        builder.UseSetting("SrcImport:BulkEnabled", "false");

        builder.ConfigureServices(services =>
        {
            var descriptor = services.Single(d =>
                d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            services.Remove(descriptor);

            services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));

            foreach (var src in services.Where(d => d.ServiceType == typeof(ISrcClient)).ToList())
            {
                services.Remove(src);
            }

            services.AddSingleton<FakeSrcClient>();
            services.AddSingleton<ISrcClient>(sp => sp.GetRequiredService<FakeSrcClient>());
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }
}
