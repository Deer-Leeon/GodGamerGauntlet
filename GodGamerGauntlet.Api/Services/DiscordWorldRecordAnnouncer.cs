using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

public interface IWorldRecordAnnouncer
{
    /// <summary>Broadcasts a freshly verified world record. Never throws.</summary>
    Task AnnounceAsync(Submission run, CancellationToken cancellationToken);
}

/// <summary>
/// Posts a rich embed to a Discord webhook when a new absolute WR lands.
/// Enabled by the DISCORD_WR_WEBHOOK_URL environment variable; silently
/// inert without it (local dev, tests). Failures are logged, never surfaced —
/// a Discord outage must not fail a moderator's verdict.
/// </summary>
public class DiscordWorldRecordAnnouncer(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<DiscordWorldRecordAnnouncer> logger) : IWorldRecordAnnouncer
{
    public async Task AnnounceAsync(Submission run, CancellationToken cancellationToken)
    {
        var webhookUrl = configuration["DISCORD_WR_WEBHOOK_URL"];
        if (string.IsNullOrWhiteSpace(webhookUrl)) return;

        var subcategories = run.Variables
            .Where(x => x.VariableValue?.Variable?.IsSubcategory == true)
            .Select(x => x.VariableValue!.Value)
            .OrderBy(v => v)
            .ToList();
        var board = subcategories.Count > 0
            ? $"{run.Category?.Name} ({string.Join(", ", subcategories)})"
            : run.Category?.Name ?? "unknown";

        var payload = new
        {
            username = "GGG Records",
            embeds = new[]
            {
                new
                {
                    title = "🏆 New World Record!",
                    description =
                        $"**{run.Player?.Username}** just set a new world record in " +
                        $"**{run.Game?.Title}** — {board}",
                    url = run.VideoUrl,
                    color = 0xFFC000, // the site's gold
                    fields = new[]
                    {
                        new { name = "Time", value = FormatTime(run.PrimaryTimeMs), inline = true },
                        new { name = "Runner", value = run.Player?.Username ?? "unknown", inline = true },
                    },
                    timestamp = DateTime.UtcNow.ToString("O"),
                },
            },
        };

        try
        {
            var client = httpClientFactory.CreateClient(nameof(DiscordWorldRecordAnnouncer));
            var response = await client.PostAsJsonAsync(webhookUrl, payload, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Discord WR webhook returned {StatusCode} for submission {SubmissionId}",
                    response.StatusCode, run.Id);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Discord WR webhook failed for submission {SubmissionId}", run.Id);
        }
    }

    private static string FormatTime(long ms)
    {
        var time = TimeSpan.FromMilliseconds(ms);
        var core = time.TotalHours >= 1
            ? $"{(int)time.TotalHours}:{time.Minutes:D2}:{time.Seconds:D2}"
            : $"{time.Minutes}:{time.Seconds:D2}";
        return time.Milliseconds > 0 ? $"{core}.{time.Milliseconds:D3}" : core;
    }
}
