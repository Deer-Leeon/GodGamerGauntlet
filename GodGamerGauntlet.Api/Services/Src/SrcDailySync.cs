using System.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services.Src;

public sealed partial class SrcImportService
{
    /// <summary>Re-fetch this much history before the previous success so an in-flight verification is not missed.</summary>
    public static readonly TimeSpan DailyOverlap = TimeSpan.FromHours(48);

    private readonly record struct BoardTouch(Guid PlayerId, Guid CategoryId);

    private enum DailyStop
    {
        ContainsStored,
        EntirePageStored,
        OlderThanCutoff,
    }

    /// <summary>
    /// Missing config means on. Tests and a deliberate opt-out set the flag false.
    /// The historical bulk import has its own switch and stays off.
    /// </summary>
    public bool DailySyncEnabled =>
        !bool.TryParse(configuration["SrcImport:DailySyncEnabled"], out var enabled) || enabled;

    private bool _dailyLockHeld;

    /// <summary>Midnight at or after <paramref name="utcNow"/>. An exact midnight is due now.</summary>
    public static DateTime UpcomingMidnightUtc(DateTime utcNow)
    {
        var midnight = new DateTime(utcNow.Year, utcNow.Month, utcNow.Day, 0, 0, 0, DateTimeKind.Utc);
        return utcNow <= midnight ? midnight : midnight.AddDays(1);
    }

    /// <summary>The midnight that follows the UTC date of <paramref name="utcNow"/>.</summary>
    public static DateTime FollowingMidnightUtc(DateTime utcNow)
    {
        var midnight = new DateTime(utcNow.Year, utcNow.Month, utcNow.Day, 0, 0, 0, DateTimeKind.Utc);
        return midnight.AddDays(1);
    }

    public async Task<SrcDailySyncState> EnsureDailyScheduleAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        var state = await context.SrcDailySyncStates
            .SingleOrDefaultAsync(s => s.Id == SrcDailySyncState.RowId, cancellationToken);
        if (state is not null) return state;

        state = new SrcDailySyncState
        {
            Id = SrcDailySyncState.RowId,
            NextRunUtc = UpcomingMidnightUtc(utcNow),
        };
        context.SrcDailySyncStates.Add(state);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
            return state;
        }
        catch (DbUpdateException)
        {
            context.Entry(state).State = EntityState.Detached;
            return await context.SrcDailySyncStates
                .SingleAsync(s => s.Id == SrcDailySyncState.RowId, cancellationToken);
        }
    }

    /// <summary>
    /// Runs the sync when <paramref name="utcNow"/> is at or past <see cref="SrcDailySyncState.NextRunUtc"/>.
    /// Returns false when the night is not due or another instance holds the lock.
    /// </summary>
    public async Task<bool> RunDueSyncAsync(DateTime utcNow, CancellationToken cancellationToken)
    {
        var state = await EnsureDailyScheduleAsync(utcNow, cancellationToken);
        if (utcNow < state.NextRunUtc) return false;
        if (!await TryAcquireDailyLockAsync(cancellationToken)) return false;

        try
        {
            await context.Entry(state).ReloadAsync(cancellationToken);
            if (utcNow < state.NextRunUtc) return false;

            var started = DateTime.UtcNow;
            try
            {
                var notes = await SyncCatalogAsync(state, cancellationToken);
                state.LastSuccessUtc = started;
                state.BackfillCompleted = true;
                state.LastError = notes.Count == 0
                    ? null
                    : Trim(string.Join(" ", notes), SrcDailySyncState.ErrorMaxLength);
                state.NextRunUtc = FollowingMidnightUtc(DateTime.UtcNow);
                await context.SaveChangesAsync(cancellationToken);
                logger.LogInformation(
                    "SRC daily sync finished. Next run at {NextRunUtc:u}.",
                    state.NextRunUtc);
                return true;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                state.LastError = Trim(ex.Message, SrcDailySyncState.ErrorMaxLength);
                await context.SaveChangesAsync(cancellationToken);
                throw;
            }
        }
        finally
        {
            await ReleaseDailyLockAsync();
        }
    }

    private async Task<List<string>> SyncCatalogAsync(SrcDailySyncState state, CancellationToken cancellationToken)
    {
        var backfill = !state.BackfillCompleted || state.LastSuccessUtc is null;
        var cutoff = state.LastSuccessUtc?.Subtract(DailyOverlap);
        var links = await context.GameSrcLinks
            .Where(link => link.ImportEnabled)
            .ToListAsync(cancellationToken);
        var notes = new List<string>();
        var boards = 0;

        foreach (var link in links)
        {
            if (!await RefreshStructureAsync(link, cancellationToken))
            {
                logger.LogWarning(
                    "SRC daily sync skipped {Abbreviation}: speedrun.com has no game by that abbreviation.",
                    link.SrcAbbreviation);
                continue;
            }

            var touches = new HashSet<BoardTouch>();
            if (backfill)
            {
                notes.AddRange(await BackfillCappedSlicesAsync(link, touches, cancellationToken));
                var recent = await WalkRunsAsync(
                    link,
                    categoryId: null,
                    levelId: null,
                    platformId: null,
                    regionId: null,
                    emulated: null,
                    status: "verified",
                    orderBy: "verify-date",
                    stop: DailyStop.EntirePageStored,
                    cutoff: null,
                    rejectKnown: false,
                    touches,
                    cancellationToken);
                if (recent is not null) notes.Add(recent);
            }
            else
            {
                var verified = await WalkRunsAsync(
                    link,
                    categoryId: null,
                    levelId: null,
                    platformId: null,
                    regionId: null,
                    emulated: null,
                    status: "verified",
                    orderBy: "verify-date",
                    stop: DailyStop.OlderThanCutoff,
                    cutoff,
                    rejectKnown: false,
                    touches,
                    cancellationToken);
                if (verified is not null) notes.Add(verified);

                var rejected = await WalkRunsAsync(
                    link,
                    categoryId: null,
                    levelId: null,
                    platformId: null,
                    regionId: null,
                    emulated: null,
                    status: "rejected",
                    orderBy: "verify-date",
                    stop: DailyStop.OlderThanCutoff,
                    cutoff,
                    rejectKnown: true,
                    touches,
                    cancellationToken);
                if (rejected is not null) notes.Add(rejected);
            }

            await RecomputePlayersAsync(touches, cancellationToken);
            boards += touches.Count;
        }

        logger.LogInformation(
            "SRC daily sync {Mode} covered {Games} linked games and {Boards} player boards.",
            backfill ? "backfill" : "delta",
            links.Count,
            boards);
        return notes;
    }

    private async Task<bool> RefreshStructureAsync(GameSrcLink link, CancellationToken cancellationToken)
    {
        var remote = await src.GetGameAsync(link.SrcAbbreviation, cancellationToken);
        if (remote?.Id is null) return false;

        link.SrcGameId = remote.Id;
        link.SrcAbbreviation = remote.Abbreviation ?? link.SrcAbbreviation;
        link.SrcWeblink = remote.Weblink ?? link.SrcWeblink;
        await EnsureLevelsAsync(link.GameId, remote.Levels?.Data ?? [], cancellationToken);

        var variables = remote.Variables?.Data ?? [];
        foreach (var srcCategory in remote.Categories?.Data ?? [])
        {
            if (string.IsNullOrWhiteSpace(srcCategory.Id) || string.IsNullOrWhiteSpace(srcCategory.Name)) continue;
            if (srcCategory.Id.Length > SrcImportCursor.SrcIdMaxLength) continue;

            var perLevel = string.Equals(srcCategory.Type, "per-level", StringComparison.OrdinalIgnoreCase);
            var category = await EnsureCategoryAsync(link.GameId, srcCategory, cancellationToken);
            await EnsureVariablesAsync(category, srcCategory.Id, variables, perLevel, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<List<string>> BackfillCappedSlicesAsync(
        GameSrcLink link, HashSet<BoardTouch> touches, CancellationToken cancellationToken)
    {
        var slices = await context.SrcImportCursors
            .Where(cursor =>
                cursor.GameId == link.GameId
                && !cursor.Superseded
                && cursor.Note != null
                && cursor.Note.Contains("first 10,000 are stored"))
            .ToListAsync(cancellationToken);

        var notes = new List<string>();
        foreach (var slice in slices)
        {
            var note = await WalkRunsAsync(
                link,
                Blank(slice.CategorySrcId),
                Blank(slice.LevelSrcId),
                Blank(slice.PlatformSrcId),
                Blank(slice.RegionSrcId),
                EmulatedFilter(slice.Emulated),
                string.IsNullOrEmpty(slice.Status) ? "verified" : slice.Status,
                orderBy: "submitted",
                stop: DailyStop.ContainsStored,
                cutoff: null,
                rejectKnown: false,
                touches,
                cancellationToken);
            if (note is not null) notes.Add(note);
        }

        return notes;
    }

    private async Task<string?> WalkRunsAsync(
        GameSrcLink link,
        string? categoryId,
        string? levelId,
        string? platformId,
        string? regionId,
        bool? emulated,
        string status,
        string orderBy,
        DailyStop stop,
        DateTime? cutoff,
        bool rejectKnown,
        HashSet<BoardTouch> touches,
        CancellationToken cancellationToken)
    {
        var offset = 0;
        while (true)
        {
            if (offset >= RunOffsetCap)
                return CapNote(link, categoryId);

            SrcRunPage page;
            try
            {
                page = await src.GetRunsAsync(new SrcRunQuery(
                    link.SrcGameId,
                    categoryId,
                    status,
                    levelId,
                    platformId,
                    regionId,
                    emulated,
                    PageSize,
                    offset,
                    orderBy,
                    "desc"), cancellationToken);
            }
            catch (SrcOffsetCapException)
            {
                return CapNote(link, categoryId);
            }

            if (page.Data.Count == 0) return null;

            if (stop == DailyStop.EntirePageStored)
            {
                var existing = await ExistingRunIdsAsync(RunIds(page.Data), cancellationToken);
                var entirePageStored = page.Data.All(run =>
                    run.Id is not null && existing.Contains(run.Id));
                if (entirePageStored) return null;
            }

            var actionable = new List<SrcRun>();
            var crossedCutoff = false;
            if (stop == DailyStop.OlderThanCutoff && cutoff is DateTime cut)
            {
                foreach (var run in page.Data)
                {
                    var verifiedAt = ParseSubmittedDate(run.Status?.VerifyDate);
                    if (verifiedAt is DateTime at && at < cut)
                    {
                        crossedCutoff = true;
                        break;
                    }

                    actionable.Add(run);
                }
            }
            else
            {
                actionable.AddRange(page.Data);
            }

            HashSet<string> storedBefore = [];
            if (stop == DailyStop.ContainsStored)
                storedBefore = await ExistingRunIdsAsync(RunIds(actionable), cancellationToken);

            if (actionable.Count > 0)
                await ApplyRunsAsync(link, actionable, rejectKnown, touches, cancellationToken);

            var shortPage = page.Data.Count < PageSize;
            var hitStored = stop == DailyStop.ContainsStored
                && RunIds(actionable).Any(storedBefore.Contains);
            if (crossedCutoff || hitStored || shortPage) return null;

            var next = offset + page.Data.Count;
            if (next >= RunOffsetCap)
                return CapNote(link, categoryId);
            offset = next;
        }
    }

    private async Task ApplyRunsAsync(
        GameSrcLink link,
        IReadOnlyList<SrcRun> runs,
        bool rejectKnown,
        HashSet<BoardTouch> touches,
        CancellationToken cancellationToken)
    {
        var categories = await context.Categories
            .Where(category => category.GameId == link.GameId && category.SrcCategoryId != null)
            .ToListAsync(cancellationToken);
        var bySrcId = categories
            .GroupBy(category => category.SrcCategoryId!, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        var variablesByCategory = new Dictionary<Guid, List<Variable>>();

        foreach (var run in runs)
        {
            if (rejectKnown)
            {
                var rejected = await RejectKnownRunAsync(run, cancellationToken);
                if (rejected is BoardTouch touch) touches.Add(touch);
                continue;
            }

            var srcCategoryId = SrcRunIds.AsId(run.Category);
            if (srcCategoryId is null || !bySrcId.TryGetValue(srcCategoryId, out var category)) continue;
            if (!variablesByCategory.TryGetValue(category.Id, out var localVars))
            {
                localVars = await context.Variables
                    .Include(variable => variable.Values)
                    .Where(variable => variable.CategoryId == category.Id)
                    .ToListAsync(cancellationToken);
                variablesByCategory[category.Id] = localVars;
            }

            foreach (var touch in await UpsertRunAsync(link.GameId, category, localVars, run, cancellationToken))
                touches.Add(touch);
        }
    }

    private async Task<BoardTouch?> RejectKnownRunAsync(SrcRun run, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(run.Id)) return null;
        var existing = await context.Submissions
            .FirstOrDefaultAsync(submission => submission.SrcRunId == run.Id, cancellationToken);
        if (existing is null || existing.Status == SubmissionStatus.Rejected) return null;

        var reason = run.Status?.Reason?.Trim();
        if (reason is { Length: 0 }) reason = null;
        if (reason is { Length: > Submission.RejectReasonMaxLength })
            reason = reason[..Submission.RejectReasonMaxLength];

        existing.Status = SubmissionStatus.Rejected;
        existing.IsObsolete = true;
        existing.RejectReason = reason;
        existing.ReviewedAt = ParseSubmittedDate(run.Status?.VerifyDate) ?? DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        return new BoardTouch(existing.PlayerId, existing.CategoryId);
    }

    private async Task RecomputePlayersAsync(HashSet<BoardTouch> touches, CancellationToken cancellationToken)
    {
        if (touches.Count == 0) return;

        foreach (var touch in touches)
        {
            var verified = await context.Submissions
                .Include(submission => submission.Variables)
                .ThenInclude(row => row.VariableValue)
                .ThenInclude(value => value!.Variable)
                .Where(submission =>
                    submission.PlayerId == touch.PlayerId
                    && submission.CategoryId == touch.CategoryId
                    && submission.Status == SubmissionStatus.Verified)
                .ToListAsync(cancellationToken);
            SubmissionObsolescence.RecomputeCategory(verified);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task<HashSet<string>> ExistingRunIdsAsync(
        List<string> ids, CancellationToken cancellationToken)
    {
        if (ids.Count == 0) return new HashSet<string>(StringComparer.Ordinal);
        var found = await context.Submissions.AsNoTracking()
            .Where(submission => submission.SrcRunId != null && ids.Contains(submission.SrcRunId))
            .Select(submission => submission.SrcRunId!)
            .ToListAsync(cancellationToken);
        return found.ToHashSet(StringComparer.Ordinal);
    }

    private static List<string> RunIds(IEnumerable<SrcRun> runs) =>
        runs.Select(run => run.Id)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    private static string CapNote(GameSrcLink link, string? categoryId) =>
        $"Slice {link.SrcAbbreviation}/{categoryId ?? "all"} kept the newest {RunOffsetCap} runs; the page cap stopped the walk.";

    private async Task<bool> TryAcquireDailyLockAsync(CancellationToken cancellationToken)
    {
        if (!context.Database.IsNpgsql()) return true;

        var connection = context.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
            await connection.OpenAsync(cancellationToken);

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT pg_try_advisory_lock(874210241)";
        _dailyLockHeld = IsTrue(await command.ExecuteScalarAsync(cancellationToken));
        return _dailyLockHeld;
    }

    private async Task ReleaseDailyLockAsync()
    {
        if (!_dailyLockHeld) return;

        var connection = context.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT pg_advisory_unlock(874210241)";
        await command.ExecuteScalarAsync();
        _dailyLockHeld = false;
    }

    private static bool IsTrue(object? value) => value switch
    {
        bool flag => flag,
        long number => number != 0,
        int number => number != 0,
        _ => false,
    };
}
