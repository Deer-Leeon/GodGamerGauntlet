using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IGameRepository, GameRepository>();
builder.Services.AddScoped<IRunRepository, RunRepository>();
builder.Services.AddScoped<IUserRepository, UserRepository>();

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

// CheapShark ingestion: typed client with standard resilience (retries with
// backoff on transient faults), consumed only by the background sync worker.
builder.Services.AddHttpClient<CheapSharkClient>(client =>
{
    client.BaseAddress = new Uri("https://www.cheapshark.com/");
    client.Timeout = TimeSpan.FromSeconds(30);
    // CheapShark rejects requests without a descriptive User-Agent (400).
    client.DefaultRequestHeaders.UserAgent.ParseAdd("GodGamerGauntlet/1.0 (godgamergauntlet.com)");
}).AddStandardResilienceHandler();

builder.Services.AddScoped<IGameSyncService, GameSyncService>();
builder.Services.AddHostedService<GameSyncBackgroundService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

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
app.UseAuthorization();
app.MapControllers();

app.Run();
