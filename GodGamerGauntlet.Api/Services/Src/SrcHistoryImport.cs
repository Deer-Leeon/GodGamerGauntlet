using System.Collections.Concurrent;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services.Src;

public sealed record SrcImportStatus(
    bool BulkEnabled,
    bool Running,
    int CursorsTotal,
    int CursorsOpen,
    int CursorsCompleted,
    int RunsStored,
    IReadOnlyList<string> Notes);

public sealed partial class SrcImportService
{
    private static readonly string[] RunStatuses = ["verified"];
    private static readonly ConcurrentDictionary<string, string?> VerifierNames = new(StringComparer.Ordinal);

    private int PageSize
    {
        get
        {
            if (!int.TryParse(configuration["SrcImport:PageSize"], out var size) || size < 1)
                return 200;
            return Math.Min(size, 200);
        }
    }

    public async Task<SrcImportStatus> GetStatusAsync(CancellationToken cancellationToken)
    {
        var total = await context.SrcImportCursors.CountAsync(cancellationToken);
        var open = await context.SrcImportCursors.CountAsync(c => !c.Completed, cancellationToken);
        var runs = await context.Submissions.CountAsync(
            s => s.Origin == SubmissionOrigin.SrcImport, cancellationToken);
        var notes = await context.SrcImportCursors.AsNoTracking()
            .Where(c => c.Note != null && c.Note != "")
            .Select(c => c.Note!)
            .Distinct()
            .OrderBy(n => n)
            .Take(20)
            .ToListAsync(cancellationToken);

        return new SrcImportStatus(
            BulkEnabled,
            open > 0,
            total,
            open,
            total - open,
            runs,
            notes);
    }

    public async Task<SrcImportStatus> StartBulkAsync(CancellationToken cancellationToken)
    {
        if (!BulkEnabled) throw new InvalidOperationException(BulkDisabledMessage);

        var open = await context.SrcImportCursors.AnyAsync(c => !c.Completed, cancellationToken);
        if (!open)
        {
            await context.SrcImportCursors.ExecuteDeleteAsync(cancellationToken);
            var gameIds = await context.GameSrcLinks.AsNoTracking()
                .Where(l => l.ImportEnabled)
                .Select(l => l.GameId)
                .ToListAsync(cancellationToken);
            var now = DateTime.UtcNow;
            foreach (var gameId in gameIds)
            {
                context.SrcImportCursors.Add(StructureCursor(gameId, now));
            }

            await context.SaveChangesAsync(cancellationToken);
            logger.LogInformation("SRC import queued for {Count} games.", gameIds.Count);
        }

        return await GetStatusAsync(cancellationToken);
    }

    public async Task<SrcImportStatus> EnqueueGameAsync(string abbreviation, CancellationToken cancellationToken)
    {
        if (!BulkEnabled) throw new InvalidOperationException(BulkDisabledMessage);

        var remote = await src.GetGameAsync(abbreviation, cancellationToken);
        if (remote?.Id is null)
            throw new InvalidOperationException($"SRC game '{abbreviation}' was not found.");

        var local = await ResolveLocalGameAsync(abbreviation, remote, cancellationToken);
        if (local is null)
        {
            throw new InvalidOperationException(
                $"No catalog game titled '{SrcFlagshipMap.FindByAbbreviation(abbreviation)?.Title ?? abbreviation}'.");
        }

        var open = await context.SrcImportCursors.AnyAsync(
            c => c.GameId == local.Id && !c.Completed, cancellationToken);
        if (!open)
        {
            await context.SrcImportCursors.Where(c => c.GameId == local.Id).ExecuteDeleteAsync(cancellationToken);
            context.SrcImportCursors.Add(StructureCursor(local.Id, DateTime.UtcNow));
            await context.SaveChangesAsync(cancellationToken);
        }

        return await GetStatusAsync(cancellationToken);
    }

    public Task<bool> ProcessNextAsync(CancellationToken cancellationToken) =>
        ProcessNextAsync(gameId: null, cancellationToken);

    public Task<bool> ProcessNextAsync(Guid gameId, CancellationToken cancellationToken) =>
        ProcessNextAsync((Guid?)gameId, cancellationToken);

    private async Task<SrcImportResult> DrainGameAsync(string abbreviation, CancellationToken cancellationToken)
    {
        var result = new SrcImportResult();
        var remote = await src.GetGameAsync(abbreviation, cancellationToken);
        if (remote?.Id is null)
        {
            result.Notes.Add($"SRC game '{abbreviation}' was not found.");
            return result;
        }

        var local = await ResolveLocalGameAsync(abbreviation, remote, cancellationToken);
        if (local is null)
        {
            result.Notes.Add(
                $"No catalog game titled '{SrcFlagshipMap.FindByAbbreviation(abbreviation)?.Title ?? abbreviation}' — skipped {abbreviation}.");
            return result;
        }

        await context.SrcImportCursors.Where(c => c.GameId == local.Id).ExecuteDeleteAsync(cancellationToken);
        context.SrcImportCursors.Add(StructureCursor(local.Id, DateTime.UtcNow));
        await context.SaveChangesAsync(cancellationToken);

        while (await ProcessNextAsync(local.Id, cancellationToken))
        {
        }

        result.Games = 1;
        result.Categories = await context.Categories.CountAsync(c => c.GameId == local.Id, cancellationToken);
        result.RunsUpserted = await context.Submissions.CountAsync(
            s => s.GameId == local.Id && s.Origin == SubmissionOrigin.SrcImport, cancellationToken);
        return result;
    }

    private async Task<bool> ProcessNextAsync(Guid? gameId, CancellationToken cancellationToken)
    {
        var query = context.SrcImportCursors.Where(c => !c.Completed && !c.Superseded);
        if (gameId is Guid id) query = query.Where(c => c.GameId == id);

        var cursor = await query
            .OrderByDescending(c => c.IsStructure)
            .ThenBy(c => c.UpdatedAt)
            .ThenBy(c => c.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (cursor is null) return false;

        if (cursor.IsStructure) await ImportStructureAsync(cursor, cancellationToken);
        else await ImportRunPageAsync(cursor, cancellationToken);
        return true;
    }

    private async Task ImportStructureAsync(SrcImportCursor cursor, CancellationToken cancellationToken)
    {
        var link = await context.GameSrcLinks
            .FirstOrDefaultAsync(l => l.GameId == cursor.GameId, cancellationToken);
        if (link is null)
        {
            await FinishCursorAsync(cursor, "This game has no speedrun.com link.", cancellationToken);
            return;
        }

        var remote = await src.GetGameAsync(link.SrcAbbreviation, cancellationToken);
        if (remote?.Id is null)
        {
            await FinishCursorAsync(cursor, $"SRC game '{link.SrcAbbreviation}' was not found.", cancellationToken);
            return;
        }

        link.SrcGameId = remote.Id;
        link.SrcAbbreviation = remote.Abbreviation ?? link.SrcAbbreviation;
        link.SrcWeblink = remote.Weblink ?? link.SrcWeblink;

        var variables = remote.Variables?.Data ?? [];
        await EnsureLevelsAsync(cursor.GameId, remote.Levels?.Data ?? [], cancellationToken);

        var categories = 0;
        foreach (var srcCategory in remote.Categories?.Data ?? [])
        {
            if (string.IsNullOrWhiteSpace(srcCategory.Id) || string.IsNullOrWhiteSpace(srcCategory.Name)) continue;
            if (srcCategory.Id.Length > SrcImportCursor.SrcIdMaxLength) continue;

            var perLevel = string.Equals(srcCategory.Type, "per-level", StringComparison.OrdinalIgnoreCase);
            var category = await EnsureCategoryAsync(cursor.GameId, srcCategory, cancellationToken);
            await EnsureVariablesAsync(category, srcCategory.Id, variables, perLevel, cancellationToken);
            categories++;

            foreach (var status in RunStatuses)
            {
                var runCursor = RunCursor(cursor.GameId, srcCategory.Id, status, DateTime.UtcNow);
                if (await CursorExistsAsync(runCursor, cancellationToken)) continue;
                context.SrcImportCursors.Add(runCursor);
            }
        }

        cursor.Completed = true;
        cursor.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "SRC structure imported for {Abbreviation}: {Categories} categories.",
            link.SrcAbbreviation, categories);
        await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
    }

    private async Task ImportRunPageAsync(SrcImportCursor cursor, CancellationToken cancellationToken)
    {
        var link = await context.GameSrcLinks.AsNoTracking()
            .FirstOrDefaultAsync(l => l.GameId == cursor.GameId, cancellationToken);
        var category = string.IsNullOrEmpty(cursor.CategorySrcId)
            ? null
            : await context.Categories.FirstOrDefaultAsync(
                c => c.GameId == cursor.GameId && c.SrcCategoryId == cursor.CategorySrcId,
                cancellationToken);

        if (link is null || category is null || string.IsNullOrEmpty(cursor.Status))
        {
            await FinishCursorAsync(cursor, "Partition is missing its game, category, or status.", cancellationToken);
            return;
        }

        if (!string.Equals(cursor.Status, "verified", StringComparison.OrdinalIgnoreCase))
        {
            await FinishCursorAsync(cursor, "Only verified runs are imported.", cancellationToken);
            return;
        }

        if (cursor.Offset >= RunOffsetCap)
        {
            await SupersedeAsync(cursor, category, cancellationToken);
            await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
            return;
        }

        SrcRunPage page;
        try
        {
            page = await src.GetRunsAsync(new SrcRunQuery(
                link.SrcGameId,
                cursor.CategorySrcId,
                cursor.Status,
                Blank(cursor.LevelSrcId),
                Blank(cursor.PlatformSrcId),
                Blank(cursor.RegionSrcId),
                EmulatedFilter(cursor.Emulated),
                PageSize,
                cursor.Offset), cancellationToken);
        }
        catch (SrcOffsetCapException)
        {
            await SupersedeAsync(cursor, category, cancellationToken);
            await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
            return;
        }

        var localVars = await context.Variables
            .Include(v => v.Values)
            .Where(v => v.CategoryId == category.Id)
            .ToListAsync(cancellationToken);

        foreach (var run in page.Data)
        {
            await UpsertRunAsync(cursor.GameId, category, localVars, run, cancellationToken);
        }

        if (page.Data.Count < PageSize)
        {
            cursor.Completed = true;
        }
        else
        {
            var next = cursor.Offset + page.Data.Count;
            if (next >= RunOffsetCap)
            {
                await SupersedeAsync(cursor, category, cancellationToken);
                await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
                return;
            }

            cursor.Offset = next;
        }

        cursor.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        if (cursor.Completed) await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
    }

    private async Task SupersedeAsync(
        SrcImportCursor cursor, Category category, CancellationToken cancellationToken)
    {
        var children = new List<SrcImportCursor>();
        var perLevel = string.Equals(category.Type, "per-level", StringComparison.OrdinalIgnoreCase);

        if (perLevel && cursor.LevelSrcId.Length == 0)
        {
            var levels = await context.GameLevels.AsNoTracking()
                .Where(l => l.GameId == cursor.GameId && l.SrcLevelId != null && l.SrcLevelId != "")
                .Select(l => l.SrcLevelId!)
                .ToListAsync(cancellationToken);
            children.AddRange(levels.Select(level => Child(cursor, level: level)));
        }

        if (children.Count == 0 && cursor.PlatformSrcId.Length == 0)
        {
            var remote = await RemoteGameAsync(cursor.GameId, cancellationToken);
            children.AddRange(IdsOf(remote?.Platforms?.Data).Select(id => Child(cursor, platform: id)));
        }

        if (children.Count == 0 && cursor.RegionSrcId.Length == 0)
        {
            var remote = await RemoteGameAsync(cursor.GameId, cancellationToken);
            children.AddRange(IdsOf(remote?.Regions?.Data).Select(id => Child(cursor, region: id)));
        }

        if (children.Count == 0 && cursor.Emulated.Length == 0)
        {
            children.Add(Child(cursor, emulated: "true"));
            children.Add(Child(cursor, emulated: "false"));
        }

        var added = new List<SrcImportCursor>();
        foreach (var child in children)
        {
            if (added.Any(existing => SameSlice(existing, child))) continue;
            if (await CursorExistsAsync(child, cancellationToken)) continue;
            added.Add(child);
            context.SrcImportCursors.Add(child);
        }

        cursor.Completed = true;
        cursor.UpdatedAt = DateTime.UtcNow;
        if (children.Count == 0)
        {
            cursor.Superseded = false;
            cursor.Note = Trim(SrcImportCursor.CappedSliceNote, SrcImportCursor.NoteMaxLength);
            logger.LogWarning(
                "SRC partition {Category} {Status} kept the first {Cap} runs.",
                cursor.CategorySrcId, cursor.Status, RunOffsetCap);
        }
        else
        {
            cursor.Superseded = true;
            cursor.Note = null;
            logger.LogInformation(
                "SRC partition {Category} {Status} passed {Cap} rows and split into {Count}.",
                cursor.CategorySrcId, cursor.Status, RunOffsetCap, added.Count);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<BoardTouch>> UpsertRunAsync(
        Guid gameId,
        Category category,
        IReadOnlyList<Variable> localVars,
        SrcRun run,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(run.Id) || run.Id.Length > Submission.SrcRunIdMaxLength) return [];

        var players = run.Players ?? [];
        if (players.Count == 0) return [];

        var timeMs = (long)Math.Round((run.Times?.PrimaryT ?? 0) * 1000d);
        if (timeMs <= 0) return [];

        var links = ProofUrls.HttpLinks(
            (run.Videos?.Links ?? []).Select(l => l.Uri).Append(run.Splits?.Uri));
        var video = ProofUrls.FirstAccepted(links)
            ?? links.FirstOrDefault()
            ?? (string.IsNullOrWhiteSpace(run.Weblink) ? "" : run.Weblink.Trim());
        video = Trim(video, Submission.VideoUrlMaxLength);

        var status = MapStatus(run.Status?.Status);
        if (status != SubmissionStatus.Verified) return [];

        var level = await EnsureRunLevelAsync(gameId, run.Level, cancellationToken);
        var (platformId, platformName) = await ResolveNameAsync(
            EmbeddedRef(run.Platform, run.System?.Platform), src.GetPlatformNameAsync, cancellationToken);
        var (regionId, regionName) = await ResolveNameAsync(
            EmbeddedRef(run.Region, run.System?.Region), src.GetRegionNameAsync, cancellationToken);
        var verifierId = string.IsNullOrWhiteSpace(run.Status?.Examiner) ? null : run.Status.Examiner.Trim();
        if (verifierId is { Length: > Submission.SrcRunIdMaxLength }) verifierId = verifierId[..Submission.SrcRunIdMaxLength];
        var verifierName = await VerifierNameAsync(verifierId, cancellationToken);
        var playedOn = ParsePlayedOn(run);
        var submitted = ParseSubmitted(run);
        var reviewedAt = status == SubmissionStatus.Pending
            ? null
            : ParseSubmittedDate(run.Status?.VerifyDate) ?? (status == SubmissionStatus.Verified ? DateTime.UtcNow : (DateTime?)null);
        var rejectReason = status == SubmissionStatus.Rejected
            ? Trim(run.Status?.Reason?.Trim() ?? "", Submission.RejectReasonMaxLength)
            : null;
        if (rejectReason is { Length: 0 }) rejectReason = null;

        var seated = new List<(SrcPlayer Source, User User)>();
        foreach (var source in players)
        {
            var (user, _) = await EnsurePlayerAsync(source, cancellationToken);
            seated.Add((source, user));
        }

        var existing = await context.Submissions
            .FirstOrDefaultAsync(s => s.SrcRunId == run.Id, cancellationToken);
        var previousPlayer = existing?.PlayerId;
        var previousCategory = existing?.CategoryId;

        Submission submission;
        if (existing is null)
        {
            submission = new Submission
            {
                Id = Guid.NewGuid(),
                GameId = gameId,
                CategoryId = category.Id,
                PlayerId = seated[0].User.Id,
                PrimaryTimeMs = timeMs,
                VideoUrl = video,
                PlayedOn = playedOn,
                Status = status,
                Origin = SubmissionOrigin.SrcImport,
                SrcRunId = run.Id,
                SubmittedAt = submitted ?? playedOn.UtcDateTime,
            };
            context.Submissions.Add(submission);
        }
        else
        {
            submission = existing;
            submission.GameId = gameId;
            submission.CategoryId = category.Id;
            submission.PlayerId = seated[0].User.Id;
            submission.PrimaryTimeMs = timeMs;
            submission.VideoUrl = video;
            submission.PlayedOn = playedOn;
            submission.Status = status;
            if (submitted is not null) submission.SubmittedAt = submitted.Value;

            var oldPlayers = await context.SubmissionPlayers
                .Where(p => p.SubmissionId == submission.Id).ToListAsync(cancellationToken);
            var oldProofs = await context.SubmissionProofs
                .Where(p => p.SubmissionId == submission.Id).ToListAsync(cancellationToken);
            var oldVars = await context.SubmissionVariables
                .Where(v => v.SubmissionId == submission.Id).ToListAsync(cancellationToken);
            context.SubmissionPlayers.RemoveRange(oldPlayers);
            context.SubmissionProofs.RemoveRange(oldProofs);
            context.SubmissionVariables.RemoveRange(oldVars);
            await context.SaveChangesAsync(cancellationToken);
        }

        submission.LevelId = level?.Id;
        submission.RealtimeMs = ToMs(run.Times?.RealtimeT);
        submission.RealtimeNoloadsMs = ToMs(run.Times?.RealtimeNoloadsT);
        submission.IngameMs = ToMs(run.Times?.IngameT);
        submission.IsEmulator = run.System?.Emulated == true;
        submission.PlatformSrcId = Fit(platformId, Submission.SrcRunIdMaxLength);
        submission.PlatformName = platformName;
        submission.RegionSrcId = Fit(regionId, Submission.SrcRunIdMaxLength);
        submission.RegionName = regionName;
        submission.VerifierSrcId = verifierId;
        submission.VerifierName = verifierName;
        submission.SrcWeblink = Fit(run.Weblink, Submission.WeblinkMaxLength);
        submission.RejectReason = rejectReason;
        submission.ReviewedAt = reviewedAt;
        submission.IsObsolete = false;

        for (var i = 0; i < seated.Count; i++)
        {
            var (source, user) = seated[i];
            var guest = string.Equals(source.Rel, "guest", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(source.Id);
            context.SubmissionPlayers.Add(new SubmissionPlayer
            {
                Id = Guid.NewGuid(),
                SubmissionId = submission.Id,
                UserId = user.Id,
                Name = PlayerLabel(source),
                SrcUserId = guest ? null : Fit(source.Id, SubmissionPlayer.SrcIdMaxLength),
                IsGuest = guest,
                SortOrder = i,
            });
        }

        for (var i = 0; i < links.Count; i++)
        {
            context.SubmissionProofs.Add(new SubmissionProof
            {
                Id = Guid.NewGuid(),
                SubmissionId = submission.Id,
                Url = links[i],
                SortOrder = i,
            });
        }

        var seenValues = new HashSet<Guid>();
        foreach (var (srcVarId, srcValId) in run.Values ?? [])
        {
            var match = localVars
                .SelectMany(v => v.Values.Select(val => (Variable: v, Value: val)))
                .FirstOrDefault(pair =>
                    pair.Variable.SrcVariableId == srcVarId && pair.Value.SrcValueId == srcValId);
            if (match.Value is null || !seenValues.Add(match.Value.Id)) continue;
            context.SubmissionVariables.Add(new SubmissionVariable
            {
                SubmissionId = submission.Id,
                VariableValueId = match.Value.Id,
            });
        }

        await context.SaveChangesAsync(cancellationToken);
        var touches = new List<BoardTouch> { new(submission.PlayerId, submission.CategoryId) };
        if (previousPlayer is Guid oldPlayer
            && previousCategory is Guid oldCategory
            && (oldPlayer != submission.PlayerId || oldCategory != submission.CategoryId))
        {
            touches.Add(new BoardTouch(oldPlayer, oldCategory));
        }

        return touches;
    }

    private async Task MaybeRecomputeAsync(Guid gameId, CancellationToken cancellationToken)
    {
        var structureDone = await context.SrcImportCursors.AnyAsync(
            c => c.GameId == gameId && c.IsStructure && c.Completed, cancellationToken);
        if (!structureDone) return;

        var open = await context.SrcImportCursors.AnyAsync(
            c => c.GameId == gameId && !c.IsStructure && !c.Completed, cancellationToken);
        if (open) return;

        var categoryIds = await context.Categories
            .Where(c => c.GameId == gameId)
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);
        foreach (var categoryId in categoryIds)
        {
            await RecomputeCategoryAsync(categoryId, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
        logger.LogInformation("SRC import recomputed personal bests for game {GameId}.", gameId);
    }

    private async Task FinishCursorAsync(SrcImportCursor cursor, string note, CancellationToken cancellationToken)
    {
        cursor.Completed = true;
        cursor.Note = Trim(note, SrcImportCursor.NoteMaxLength);
        cursor.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(cancellationToken);
        await MaybeRecomputeAsync(cursor.GameId, cancellationToken);
    }

    private async Task<SrcGame?> RemoteGameAsync(Guid gameId, CancellationToken cancellationToken)
    {
        var link = await context.GameSrcLinks.AsNoTracking()
            .FirstOrDefaultAsync(l => l.GameId == gameId, cancellationToken);
        if (link is null) return null;
        return await src.GetGameAsync(link.SrcAbbreviation, cancellationToken);
    }

    private async Task<string?> VerifierNameAsync(string? examinerId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(examinerId)) return null;
        if (VerifierNames.TryGetValue(examinerId, out var cached)) return cached;

        var name = await src.GetUserNameAsync(examinerId, cancellationToken);
        var trimmed = name is null ? null : Trim(name, Submission.SrcNameMaxLength);
        VerifierNames.TryAdd(examinerId, trimmed);
        return trimmed;
    }

    private Task<bool> CursorExistsAsync(SrcImportCursor cursor, CancellationToken cancellationToken) =>
        context.SrcImportCursors.AnyAsync(c =>
            c.GameId == cursor.GameId
            && c.IsStructure == cursor.IsStructure
            && c.CategorySrcId == cursor.CategorySrcId
            && c.Status == cursor.Status
            && c.LevelSrcId == cursor.LevelSrcId
            && c.PlatformSrcId == cursor.PlatformSrcId
            && c.RegionSrcId == cursor.RegionSrcId
            && c.Emulated == cursor.Emulated, cancellationToken);

    private static SrcImportCursor StructureCursor(Guid gameId, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        GameId = gameId,
        IsStructure = true,
        UpdatedAt = now,
    };

    private static SrcImportCursor RunCursor(Guid gameId, string categoryId, string status, DateTime now) => new()
    {
        Id = Guid.NewGuid(),
        GameId = gameId,
        CategorySrcId = categoryId,
        Status = status,
        UpdatedAt = now,
    };

    private static SrcImportCursor Child(
        SrcImportCursor parent,
        string? level = null,
        string? platform = null,
        string? region = null,
        string? emulated = null) => new()
    {
        Id = Guid.NewGuid(),
        GameId = parent.GameId,
        CategorySrcId = parent.CategorySrcId,
        Status = parent.Status,
        LevelSrcId = level ?? parent.LevelSrcId,
        PlatformSrcId = platform ?? parent.PlatformSrcId,
        RegionSrcId = region ?? parent.RegionSrcId,
        Emulated = emulated ?? parent.Emulated,
        Offset = 0,
        UpdatedAt = DateTime.UtcNow,
    };

    private static bool SameSlice(SrcImportCursor left, SrcImportCursor right) =>
        left.GameId == right.GameId
        && left.IsStructure == right.IsStructure
        && left.CategorySrcId == right.CategorySrcId
        && left.Status == right.Status
        && left.LevelSrcId == right.LevelSrcId
        && left.PlatformSrcId == right.PlatformSrcId
        && left.RegionSrcId == right.RegionSrcId
        && left.Emulated == right.Emulated;

    private static List<string> IdsOf(IEnumerable<SrcNamed>? named) =>
        (named ?? [])
            .Select(n => n.Id)
            .Where(id => !string.IsNullOrWhiteSpace(id) && id!.Length <= SrcImportCursor.SrcIdMaxLength)
            .Select(id => id!)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    private static object? EmbeddedRef(object? embedded, object? raw) =>
        string.IsNullOrWhiteSpace(SrcRunIds.AsId(embedded)) ? raw : embedded;

    private static string? Blank(string value) => value.Length == 0 ? null : value;

    private static bool? EmulatedFilter(string value) => value switch
    {
        "true" => true,
        "false" => false,
        _ => null,
    };

    private static SubmissionStatus MapStatus(string? status) => status?.ToLowerInvariant() switch
    {
        "verified" => SubmissionStatus.Verified,
        "rejected" => SubmissionStatus.Rejected,
        _ => SubmissionStatus.Pending,
    };

    private static string? Fit(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }
}
