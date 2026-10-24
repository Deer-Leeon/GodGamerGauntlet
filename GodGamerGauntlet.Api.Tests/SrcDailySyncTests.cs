using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services.Src;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GodGamerGauntlet.Api.Tests;

public class SrcDailySyncTests : IClassFixture<CourtApiFactory>
{
    private readonly CourtApiFactory _factory;

    public SrcDailySyncTests(CourtApiFactory factory) => _factory = factory;

    [Fact]
    public void Midnight_helpers_round_to_utc_midnights()
    {
        var afternoon = new DateTime(2026, 10, 24, 19, 0, 0, DateTimeKind.Utc);
        Assert.Equal(new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), SrcImportService.UpcomingMidnightUtc(afternoon));

        var midnight = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc);
        Assert.Equal(midnight, SrcImportService.UpcomingMidnightUtc(midnight));
        Assert.Equal(midnight.AddDays(1), SrcImportService.FollowingMidnightUtc(midnight.AddMinutes(40)));
    }

    [Fact]
    public async Task First_boot_schedules_midnight_and_does_not_sync()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        var before = src.RunRequests;
        await ClearStateAsync();

        using var scope = _factory.Services.CreateScope();
        var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
        var ran = await importer.RunDueSyncAsync(
            new DateTime(2026, 10, 24, 19, 0, 0, DateTimeKind.Utc),
            CancellationToken.None);

        Assert.False(ran);
        Assert.Equal(before, src.RunRequests);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = await db.SrcDailySyncStates.SingleAsync();
        Assert.Equal(new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc), state.NextRunUtc);
        Assert.False(state.BackfillCompleted);
    }

    [Fact]
    public async Task Backfill_inserts_newer_runs_and_stops_at_the_stored_boundary()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        var (game, link) = await CupheadLinkAsync();
        src.Runs.RemoveAll(run => SrcRunIds.AsId(run.Game) == link.SrcGameId);
        src.RunRequests = 0;
        RegisterGame(src, link);
        src.Games["ghost-game"] = new SrcGame
        {
            Id = "ghostid",
            Abbreviation = "ghost-game",
            Names = new SrcNames { International = "Ghost Game Should Not Exist" },
        };

        var categoryId = await EnsureCategoryAsync(game.Id, "dyncat", "Daily Sync Any%");
        await ReplaceCursorsAsync(game.Id, "dyncat");
        var playerId = await PlayerAsync();
        await StoreRunAsync(game.Id, categoryId, playerId, "oldstored", 20_000);
        await StoreRunAsync(game.Id, categoryId, playerId, "fillerun", 21_000);

        src.Runs.Add(Run(link.SrcGameId, "dyncat", "newerun1", "verified", 11, "2024-06-01T00:00:00Z", "2024-06-02T00:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "newerun2", "verified", 12, "2024-05-01T00:00:00Z", "2024-05-02T00:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "oldstored", "verified", 13, "2020-01-01T00:00:00Z", "2020-01-02T00:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "fillerun", "verified", 14, "2019-01-01T00:00:00Z", "2019-01-02T00:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "notseen01", "verified", 15, "2018-01-01T00:00:00Z", "2018-01-02T00:00:00Z"));

        var gamesBefore = await CountGamesAsync();
        var cursorsBefore = await CountCursorsAsync();
        await SetStateAsync(backfillCompleted: false, lastSuccess: null);

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            Assert.True(await importer.RunDueSyncAsync(DateTime.UtcNow, CancellationToken.None));
        }

        Assert.Equal(3, src.RunRequests);
        using var check = _factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(gamesBefore, await db.Games.CountAsync());
        Assert.Equal(0, await db.Games.CountAsync(g => g.Title == "Ghost Game Should Not Exist"));
        Assert.Equal(cursorsBefore, await db.SrcImportCursors.CountAsync());
        Assert.Equal(1, await db.Submissions.CountAsync(s => s.SrcRunId == "newerun1"));
        Assert.Equal(1, await db.Submissions.CountAsync(s => s.SrcRunId == "newerun2"));
        Assert.Equal(0, await db.Submissions.CountAsync(s => s.SrcRunId == "notseen01"));
        var state = await db.SrcDailySyncStates.SingleAsync();
        Assert.True(state.BackfillCompleted);
        Assert.NotNull(state.LastSuccessUtc);
    }

    [Fact]
    public async Task Later_sync_keeps_runs_outside_the_overlap_window()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        var (game, link) = await CupheadLinkAsync();
        src.Runs.RemoveAll(run => SrcRunIds.AsId(run.Game) == link.SrcGameId);
        src.RunRequests = 0;
        RegisterGame(src, link);

        var categoryId = await EnsureCategoryAsync(game.Id, "dyncat", "Daily Sync Any%");
        var playerId = await PlayerAsync();
        await StoreRunAsync(game.Id, categoryId, playerId, "stalekeep", 5_000);
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "freshnew1", "verified", 9, "2026-10-23T00:00:00Z", "2026-10-23T12:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "stalekeep", "verified", 99, "2020-01-01T00:00:00Z", "2020-01-02T00:00:00Z"));
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "ancient01", "verified", 8, "2010-01-01T00:00:00Z", "2010-01-02T00:00:00Z"));

        await SetStateAsync(
            backfillCompleted: true,
            lastSuccess: new DateTime(2026, 10, 24, 0, 0, 0, DateTimeKind.Utc));

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            Assert.True(await importer.RunDueSyncAsync(DateTime.UtcNow, CancellationToken.None));
        }

        Assert.Equal(2, src.RunRequests);
        using var check = _factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Submissions.CountAsync(s => s.SrcRunId == "freshnew1"));
        var stale = await db.Submissions.SingleAsync(s => s.SrcRunId == "stalekeep");
        Assert.Equal(5_000, stale.PrimaryTimeMs);
        Assert.Equal(0, await db.Submissions.CountAsync(s => s.SrcRunId == "ancient01"));
    }

    [Fact]
    public async Task Later_sync_rejects_a_known_run_and_ignores_an_unknown_one()
    {
        var src = _factory.Services.GetRequiredService<FakeSrcClient>();
        var (game, link) = await CupheadLinkAsync();
        src.Runs.RemoveAll(run => SrcRunIds.AsId(run.Game) == link.SrcGameId);
        src.RunRequests = 0;
        RegisterGame(src, link);

        var categoryId = await EnsureCategoryAsync(game.Id, "dynrej", "Daily Reject Any%");
        var playerId = await PlayerAsync("dailyrejectplayer");
        await StoreRunAsync(game.Id, categoryId, playerId, "fastrej1", 10_000, obsolete: false);
        await StoreRunAsync(game.Id, categoryId, playerId, "slowkeep", 30_000, obsolete: true);

        src.Runs.Add(Run(link.SrcGameId, "dyncat", "oldverif1", "verified", 40, "2020-01-01T00:00:00Z", "2020-01-02T00:00:00Z"));
        var rejected = Run(link.SrcGameId, "dyncat", "fastrej1", "rejected", 10, "2026-10-23T00:00:00Z", "2026-10-23T08:00:00Z");
        rejected.Status!.Reason = "duplicate";
        src.Runs.Add(rejected);
        src.Runs.Add(Run(link.SrcGameId, "dyncat", "unknownr1", "rejected", 11, "2026-10-23T00:00:00Z", "2026-10-23T09:00:00Z"));

        await SetStateAsync(
            backfillCompleted: true,
            lastSuccess: new DateTime(2026, 10, 24, 0, 0, 0, DateTimeKind.Utc));

        using (var scope = _factory.Services.CreateScope())
        {
            var importer = scope.ServiceProvider.GetRequiredService<SrcImportService>();
            Assert.True(await importer.RunDueSyncAsync(DateTime.UtcNow, CancellationToken.None));
        }

        using var check = _factory.Services.CreateScope();
        var db = check.ServiceProvider.GetRequiredService<AppDbContext>();
        var fast = await db.Submissions.SingleAsync(s => s.SrcRunId == "fastrej1");
        Assert.Equal(SubmissionStatus.Rejected, fast.Status);
        Assert.Equal("duplicate", fast.RejectReason);
        var slow = await db.Submissions.SingleAsync(s => s.SrcRunId == "slowkeep");
        Assert.Equal(SubmissionStatus.Verified, slow.Status);
        Assert.False(slow.IsObsolete);
        Assert.Equal(0, await db.Submissions.CountAsync(s => s.SrcRunId == "unknownr1"));
    }

    private async Task<(Game Game, GameSrcLink Link)> CupheadLinkAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var game = await db.Games.SingleAsync(g => g.Title == "Cuphead");
        var link = await db.GameSrcLinks.SingleAsync(l => l.GameId == game.Id);
        return (game, link);
    }

    private static void RegisterGame(FakeSrcClient src, GameSrcLink link)
    {
        src.Games[link.SrcAbbreviation] = new SrcGame
        {
            Id = link.SrcGameId,
            Abbreviation = link.SrcAbbreviation,
            Names = new SrcNames { International = "Cuphead" },
            Categories = new SrcEmbed<List<SrcCategory>>
            {
                Data = [new SrcCategory { Id = "dyncat", Name = "Daily Sync Any%", Type = "per-game" }],
            },
            Variables = new SrcEmbed<List<SrcVariable>> { Data = [] },
        };
    }

    private async Task<Guid> EnsureCategoryAsync(Guid gameId, string srcId, string name)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.Categories.FirstOrDefaultAsync(c => c.GameId == gameId && c.SrcCategoryId == srcId);
        if (existing is not null) return existing.Id;

        var category = new Category
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            Name = name,
            SrcCategoryId = srcId,
            Type = "per-game",
            CreatedAt = DateTime.UtcNow,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return category.Id;
    }

    private async Task ReplaceCursorsAsync(Guid gameId, string categoryId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.SrcImportCursors.Where(c => c.GameId == gameId).ToListAsync();
        db.SrcImportCursors.RemoveRange(existing);
        db.SrcImportCursors.Add(new SrcImportCursor
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            CategorySrcId = categoryId,
            Status = "verified",
            Note = SrcImportCursor.CappedSliceNote,
            Completed = true,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    private async Task<Guid> PlayerAsync(string username = "dailysyncplayer")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
        if (existing is not null) return existing.Id;

        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = username,
            CreatedAt = DateTime.UtcNow,
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task StoreRunAsync(
        Guid gameId, Guid categoryId, Guid playerId, string srcRunId, long timeMs, bool obsolete = false)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.Submissions.FirstOrDefaultAsync(s => s.SrcRunId == srcRunId);
        if (existing is not null)
        {
            existing.PrimaryTimeMs = timeMs;
            existing.Status = SubmissionStatus.Verified;
            existing.IsObsolete = obsolete;
            existing.PlayerId = playerId;
            existing.CategoryId = categoryId;
            await db.SaveChangesAsync();
            return;
        }

        db.Submissions.Add(new Submission
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            CategoryId = categoryId,
            PlayerId = playerId,
            PrimaryTimeMs = timeMs,
            VideoUrl = "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
            PlayedOn = DateTimeOffset.Parse("2020-01-01T00:00:00Z"),
            Status = SubmissionStatus.Verified,
            Origin = SubmissionOrigin.SrcImport,
            SrcRunId = srcRunId,
            SubmittedAt = DateTime.Parse("2020-01-01T00:00:00Z"),
            IsObsolete = obsolete,
        });
        await db.SaveChangesAsync();
    }

    private async Task SetStateAsync(bool backfillCompleted, DateTime? lastSuccess)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var existing = await db.SrcDailySyncStates.ToListAsync();
        db.SrcDailySyncStates.RemoveRange(existing);
        db.SrcDailySyncStates.Add(new SrcDailySyncState
        {
            Id = SrcDailySyncState.RowId,
            NextRunUtc = DateTime.UtcNow.AddMinutes(-5),
            BackfillCompleted = backfillCompleted,
            LastSuccessUtc = lastSuccess,
        });
        await db.SaveChangesAsync();
    }

    private async Task ClearStateAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.SrcDailySyncStates.RemoveRange(await db.SrcDailySyncStates.ToListAsync());
        await db.SaveChangesAsync();
    }

    private async Task<int> CountGamesAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Games.CountAsync();
    }

    private async Task<int> CountCursorsAsync()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.SrcImportCursors.CountAsync();
    }

    private static SrcRun Run(
        string gameId,
        string categoryId,
        string id,
        string status,
        double seconds,
        string submitted,
        string verifyDate) => new()
    {
        Id = id,
        Game = gameId,
        Category = categoryId,
        Status = new SrcRunStatus { Status = status, VerifyDate = verifyDate },
        Times = new SrcTimes { PrimaryT = seconds },
        Videos = new SrcVideos { Links = [new SrcVideoLink { Uri = "https://www.youtube.com/watch?v=dQw4w9wgGcQ" }] },
        Players =
        [
            new SrcPlayer
            {
                Rel = "user",
                Id = "u" + id,
                Names = new SrcNames { International = "Runner " + id },
            },
        ],
        Date = "2020-01-01",
        Submitted = submitted,
        Values = [],
    };
}
