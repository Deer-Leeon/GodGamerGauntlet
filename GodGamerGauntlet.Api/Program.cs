using System.Security.Cryptography;
using System.Text;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' is not configured.");
var npgsql = new NpgsqlConnectionStringBuilder(connectionString)
{
    // Drop idle connections quickly so Railway Serverless can sleep (pooled
    // keepalives count as outbound traffic and keep the container awake).
    MinPoolSize = 0,
    ConnectionIdleLifetime = 15,
    ConnectionPruningInterval = 10
};

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(npgsql.ConnectionString));

builder.Services.AddScoped<IGameRepository, GameRepository>();
builder.Services.AddScoped<IRunRepository, RunRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IRecordBook, RecordBook>();

// JWT auth. The signing key comes from Jwt:Secret (user secrets locally,
// Jwt__Secret env var on Railway). Missing secret falls back to a random
// per-boot key so the app stays up, but every restart logs everyone out.
var jwtSecret = builder.Configuration["Jwt:Secret"];
var jwtSecretMissing = string.IsNullOrWhiteSpace(jwtSecret);
if (jwtSecretMissing)
{
    jwtSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
}
// Hashing guarantees a 256-bit key no matter how short the configured secret is.
var signingKey = new SymmetricSecurityKey(SHA256.HashData(Encoding.UTF8.GetBytes(jwtSecret!)));

builder.Services.AddSingleton(new JwtTokenService(signingKey));
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
        policy.WithOrigins(
                  "http://localhost:3000",
                  "https://godgamergauntlet.com",
                  "https://www.godgamergauntlet.com",
                  "https://*.vercel.app")
              .SetIsOriginAllowedToAllowWildcardSubdomains()
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

// RAWG ingestion: typed client with standard resilience (retries with
// backoff on transient faults), consumed only by the sync service.
builder.Services.AddHttpClient<RawgClient>(client =>
{
    client.BaseAddress = new Uri("https://api.rawg.io/");
    client.Timeout = TimeSpan.FromMinutes(2);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("GodGamerGauntlet/1.0 (godgamergauntlet.com)");
}).ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
{
    PooledConnectionIdleTimeout = TimeSpan.FromSeconds(15)
}).AddStandardResilienceHandler(options =>
{
    // RAWG pages sometimes take >10s; the default attempt timeout cancelled
    // those calls and a circuit-break could abort the whole 500-page ingest.
    options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(30);
    options.TotalRequestTimeout.Timeout = TimeSpan.FromMinutes(2);
    options.Retry.MaxRetryAttempts = 5;
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromMinutes(2);
});

builder.Services.AddScoped<IGameSyncService, GameSyncService>();
builder.Services.AddHostedService<GameSyncBackgroundService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (jwtSecretMissing)
{
    app.Logger.LogWarning(
        "Jwt:Secret is not configured; using a random per-boot signing key. " +
        "All sessions will be invalidated on every restart — set the Jwt__Secret environment variable.");
}

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await DbInitializer.InitializeAsync(context);
}

// Behind Railway's proxy, TLS terminates upstream; trust X-Forwarded-* so the
// app sees the original scheme and doesn't 307-redirect CORS preflights.
var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor
                       | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
};
// Railway's proxy is not on loopback; without clearing these, the forwarded
// headers would be ignored entirely.
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// CORS must run before HTTPS redirection so OPTIONS preflights are answered,
// never redirected (browsers refuse redirects on preflight requests).
app.UseCors("AllowFrontend");
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
