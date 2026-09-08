using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services.Src;

public sealed class SrcImportResult
{
    public int Games { get; set; }
    public int Categories { get; set; }
    public int RunsUpserted { get; set; }
    public int RunsSkipped { get; set; }
    public int PlayersReserved { get; set; }
    public List<string> Notes { get; } = [];
}

public sealed class SrcImportService(
    AppDbContext context,
    ISrcClient src,
    IConfiguration configuration,
    ILogger<SrcImportService> logger)
{
    public bool BulkEnabled =>
        bool.TryParse(configuration["SrcImport:BulkEnabled"], out var enabled) && enabled;

    /// <summary>
    /// Fills every enabled flagship board. Requires <see cref="BulkEnabled"/>.
    /// </summary>
    public async Task<SrcImportResult> ImportBulkAsync(CancellationToken cancellationToken)
    {
        var result = new SrcImportResult();
        foreach (var entry in SrcFlagshipMap.Games)
        {
            await ImportMappedGameAsync(entry.Abbreviation, playerSrcId: null, SubmissionOrigin.SrcImport, result, cancellationToken);
        }

        return result;
    }

    public async Task<SrcImportResult> ImportGameAsync(string abbreviation, CancellationToken cancellationToken)
    {
        var result = new SrcImportResult();
        await ImportMappedGameAsync(abbreviation, playerSrcId: null, SubmissionOrigin.SrcImport, result, cancellationToken);
        return result;
    }

    /// <summary>
    /// Claim-gated path: scaffold flagship games this runner has PBs on and
    /// insert only that runner's verified full-game PBs.
    /// </summary>
    public async Task<int> ImportClaimantPbsAsync(
        string srcUserId,
        Guid playerId,
        CancellationToken cancellationToken)
    {
        var pbs = await src.GetPersonalBestsAsync(srcUserId, cancellationToken);
        var result = new SrcImportResult();
        var seenGames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var pb in pbs)
        {
            var run = pb.Run;
            if (run is null) continue;
            var srcGameId = SrcRunIds.AsId(run.Game);
            if (string.IsNullOrWhiteSpace(srcGameId) || !seenGames.Add(srcGameId)) continue;

            var remote = await src.GetGameAsync(srcGameId, cancellationToken);
            if (remote?.Abbreviation is null) continue;
            if (SrcFlagshipMap.FindByAbbreviation(remote.Abbreviation) is null)
            {
                continue;
            }

            await ImportMappedGameAsync(
                remote.Abbreviation,
                srcUserId,
                SubmissionOrigin.SrcClaimImport,
                result,
                cancellationToken,
                forcedPlayerId: playerId);
        }

        return result.RunsUpserted;
    }

    private async Task ImportMappedGameAsync(
        string abbreviation,
        string? playerSrcId,
        SubmissionOrigin origin,
        SrcImportResult result,
        CancellationToken cancellationToken,
        Guid? forcedPlayerId = null)
    {
        var remote = await src.GetGameAsync(abbreviation, cancellationToken);
        if (remote?.Id is null)
        {
            result.Notes.Add($"SRC game '{abbreviation}' was not found.");
            return;
        }

        var local = await ResolveLocalGameAsync(abbreviation, remote, cancellationToken);
        if (local is null)
        {
            result.Notes.Add(
                $"No catalog game titled '{SrcFlagshipMap.FindByAbbreviation(abbreviation)?.Title ?? abbreviation}' — skipped {abbreviation}.");
            return;
        }

        var categories = remote.Categories?.Data ?? [];
        var variables = remote.Variables?.Data ?? [];
        var importedCategories = 0;

        foreach (var srcCategory in categories)
        {
            if (!string.Equals(srcCategory.Type, "per-game", StringComparison.OrdinalIgnoreCase)) continue;
            if (srcCategory.Miscellaneous) continue;
            if (string.IsNullOrWhiteSpace(srcCategory.Id) || string.IsNullOrWhiteSpace(srcCategory.Name)) continue;

            var category = await EnsureCategoryAsync(local.Id, srcCategory, cancellationToken);
            var localVars = await EnsureVariablesAsync(category, srcCategory.Id, variables, cancellationToken);
            importedCategories++;

            var subAxes = localVars
                .Where(v => v.IsSubcategory && v.Values.Count > 0)
                .Select(v => (
                    SrcId: v.SrcVariableId!,
                    Values: (IReadOnlyList<string>)v.Values
                        .Where(x => x.SrcValueId is not null)
                        .Select(x => x.SrcValueId!)
                        .ToList()))
                .Where(axis => axis.Values.Count > 0)
                .ToList();

            foreach (var filter in Cartesian(subAxes))
            {
                var board = await src.GetLeaderboardAsync(remote.Id, srcCategory.Id, filter, cancellationToken);
                if (board?.Runs is null) continue;

                foreach (var row in board.Runs)
                {
                    if (row.Run is null) continue;
                    var outcome = await TryImportRunAsync(
                        local.Id,
                        category,
                        localVars,
                        row.Run,
                        origin,
                        playerSrcId,
                        forcedPlayerId,
                        cancellationToken);
                    if (outcome == ImportOutcome.Skipped)
                    {
                        result.RunsSkipped++;
                    }
                    else
                    {
                        result.RunsUpserted++;
                        if (outcome == ImportOutcome.Reserved) result.PlayersReserved++;
                    }
                }
            }

            await context.SaveChangesAsync(cancellationToken);
            await RecomputeCategoryAsync(category.Id, cancellationToken);
        }

        result.Games++;
        result.Categories += importedCategories;
        await context.SaveChangesAsync(cancellationToken);
        logger.LogInformation(
            "SRC import {Abbr}: {Cats} categories, {Upserted} runs, {Skipped} skipped.",
            abbreviation, importedCategories, result.RunsUpserted, result.RunsSkipped);
    }

    private async Task<Game?> ResolveLocalGameAsync(
        string abbreviation, SrcGame remote, CancellationToken cancellationToken)
    {
        var existingLink = await context.GameSrcLinks
            .Include(l => l.Game)
            .FirstOrDefaultAsync(
                l => l.SrcAbbreviation == abbreviation || l.SrcGameId == remote.Id,
                cancellationToken);
        if (existingLink?.Game is not null)
        {
            existingLink.SrcGameId = remote.Id!;
            existingLink.SrcAbbreviation = remote.Abbreviation ?? abbreviation;
            existingLink.SrcWeblink = remote.Weblink;
            return existingLink.Game;
        }

        var flagship = SrcFlagshipMap.FindByAbbreviation(abbreviation);
        if (flagship is null) return null;

        var titleKey = flagship.Title.ToLower();
        var game = await context.Games
            .FirstOrDefaultAsync(g => g.Title.ToLower() == titleKey, cancellationToken);
        if (game is null) return null;

        context.GameSrcLinks.Add(new GameSrcLink
        {
            Id = Guid.NewGuid(),
            GameId = game.Id,
            SrcGameId = remote.Id!,
            SrcAbbreviation = remote.Abbreviation ?? abbreviation,
            SrcWeblink = remote.Weblink,
            ImportEnabled = true,
        });
        await context.SaveChangesAsync(cancellationToken);
        return game;
    }

    private async Task<Category> EnsureCategoryAsync(
        Guid gameId, SrcCategory srcCategory, CancellationToken cancellationToken)
    {
        var existing = await context.Categories
            .FirstOrDefaultAsync(c => c.SrcCategoryId == srcCategory.Id, cancellationToken);
        if (existing is not null) return existing;

        var name = srcCategory.Name!.Trim();
        if (name.Length > Category.NameMaxLength) name = name[..Category.NameMaxLength];

        var clash = await context.Categories
            .AnyAsync(c => c.GameId == gameId && c.Name == name, cancellationToken);
        if (clash) name = TrimName(name, srcCategory.Id!);

        var category = new Category
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            Name = name,
            SrcCategoryId = srcCategory.Id,
            Rules = null,
            CreatedAt = DateTime.UtcNow,
        };
        context.Categories.Add(category);
        await context.SaveChangesAsync(cancellationToken);
        return category;
    }

    private async Task<List<Variable>> EnsureVariablesAsync(
        Category category,
        string srcCategoryId,
        IReadOnlyList<SrcVariable> srcVariables,
        CancellationToken cancellationToken)
    {
        var applicable = srcVariables.Where(v => AppliesTo(v, srcCategoryId)).ToList();
        foreach (var srcVar in applicable)
        {
            if (string.IsNullOrWhiteSpace(srcVar.Id) || string.IsNullOrWhiteSpace(srcVar.Name)) continue;

            var variable = await context.Variables
                .Include(v => v.Values)
                .FirstOrDefaultAsync(
                    v => v.CategoryId == category.Id && v.SrcVariableId == srcVar.Id,
                    cancellationToken);

            if (variable is null)
            {
                var name = srcVar.Name.Trim();
                if (name.Length > Variable.NameMaxLength) name = name[..Variable.NameMaxLength];
                variable = new Variable
                {
                    Id = Guid.NewGuid(),
                    CategoryId = category.Id,
                    Name = name,
                    SrcVariableId = srcVar.Id,
                    IsSubcategory = srcVar.IsSubcategory,
                    IsRequired = srcVar.Mandatory,
                };
                context.Variables.Add(variable);
            }

            foreach (var (valueId, choice) in srcVar.Values?.Values ?? [])
            {
                if (string.IsNullOrWhiteSpace(choice.Label)) continue;
                var label = choice.Label.Trim();
                if (label.Length > VariableValue.ValueMaxLength) label = label[..VariableValue.ValueMaxLength];

                var exists = variable.Values.Any(x => x.SrcValueId == valueId);
                if (exists) continue;
                variable.Values.Add(new VariableValue
                {
                    Id = Guid.NewGuid(),
                    VariableId = variable.Id,
                    Value = label,
                    SrcValueId = valueId,
                });
            }
        }

        await context.SaveChangesAsync(cancellationToken);

        return await context.Variables
            .Include(v => v.Values)
            .Where(v => v.CategoryId == category.Id)
            .ToListAsync(cancellationToken);
    }

    private static bool AppliesTo(SrcVariable variable, string srcCategoryId)
    {
        var scope = variable.Scope?.Type;
        if (string.Equals(scope, "all-levels", StringComparison.OrdinalIgnoreCase)
            || string.Equals(scope, "single-level", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (!string.IsNullOrEmpty(variable.Category)
            && !string.Equals(variable.Category, srcCategoryId, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return true;
    }

    private async Task<ImportOutcome> TryImportRunAsync(
        Guid gameId,
        Category category,
        IReadOnlyList<Variable> localVars,
        SrcRun run,
        SubmissionOrigin origin,
        string? onlySrcUserId,
        Guid? forcedPlayerId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(run.Id)) return ImportOutcome.Skipped;
        if (await context.Submissions.AnyAsync(s => s.SrcRunId == run.Id, cancellationToken))
        {
            return ImportOutcome.Skipped;
        }

        if (!string.Equals(run.Status?.Status, "verified", StringComparison.OrdinalIgnoreCase))
        {
            return ImportOutcome.Skipped;
        }

        if (!SrcRunIds.IsEmptyLevel(run.Level)) return ImportOutcome.Skipped;

        var players = run.Players ?? [];
        if (players.Count != 1) return ImportOutcome.Skipped;

        var player = players[0];
        var isGuest = string.Equals(player.Rel, "guest", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(player.Id);
        if (!isGuest && onlySrcUserId is not null
            && !string.Equals(player.Id, onlySrcUserId, StringComparison.OrdinalIgnoreCase))
        {
            return ImportOutcome.Skipped;
        }

        if (isGuest && onlySrcUserId is not null) return ImportOutcome.Skipped;

        var video = ProofUrls.FirstAccepted((run.Videos?.Links ?? []).Select(l => l.Uri));
        if (video is null) return ImportOutcome.Skipped;

        var timeMs = (long)Math.Round(run.Times?.PrimaryT * 1000 ?? 0);
        if (timeMs <= 0) return ImportOutcome.Skipped;

        Guid playerId;
        var reserved = false;
        if (forcedPlayerId is Guid forced)
        {
            playerId = forced;
        }
        else
        {
            var (user, created) = await EnsurePlayerAsync(player, cancellationToken);
            playerId = user.Id;
            reserved = created;
        }

        var playedOn = ParsePlayedOn(run);
        var submission = new Submission
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            CategoryId = category.Id,
            PlayerId = playerId,
            PrimaryTimeMs = timeMs,
            VideoUrl = video,
            PlayedOn = playedOn,
            IsEmulator = run.System?.Emulated == true,
            Status = SubmissionStatus.Verified,
            Origin = origin,
            SrcRunId = run.Id,
            IsObsolete = false,
            SubmittedAt = ParseSubmitted(run) ?? playedOn.UtcDateTime,
            ReviewedAt = DateTime.UtcNow,
        };

        foreach (var (srcVarId, srcValId) in run.Values ?? [])
        {
            var match = localVars
                .SelectMany(v => v.Values.Select(val => (Variable: v, Value: val)))
                .FirstOrDefault(pair =>
                    pair.Variable.SrcVariableId == srcVarId && pair.Value.SrcValueId == srcValId);
            if (match.Value is null) continue;
            submission.Variables.Add(new SubmissionVariable
            {
                SubmissionId = submission.Id,
                VariableValueId = match.Value.Id,
            });
        }

        context.Submissions.Add(submission);
        return reserved ? ImportOutcome.Reserved : ImportOutcome.Inserted;
    }

    private async Task<(User User, bool Created)> EnsurePlayerAsync(
        SrcPlayer player, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(player.Id)
            && !string.Equals(player.Rel, "guest", StringComparison.OrdinalIgnoreCase))
        {
            var existing = await context.Users
                .FirstOrDefaultAsync(u => u.SrcUserId == player.Id, cancellationToken);
            if (existing is not null) return (existing, false);

            var international = player.Names?.International ?? player.Name ?? player.Id;
            var handle = await SrcUsernames.AllocateHandleAsync(
                context, international, player.Id, cancellationToken);
            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = handle,
                DisplayName = SrcUsernames.NeedsDisplayName(international, handle)
                    ? TrimDisplay(international)
                    : null,
                SrcUserId = player.Id,
                IsReserved = true,
                CreatedAt = DateTime.UtcNow,
            };
            context.Users.Add(user);
            context.UsernameReservations.Add(new UsernameReservation
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                ReservedUsername = handle,
                SrcUserId = player.Id,
                ReservedAt = DateTime.UtcNow,
            });
            await context.SaveChangesAsync(cancellationToken);
            return (user, true);
        }

        var guestName = player.Name ?? player.Names?.International ?? "guest";
        var guestKey = guestName.ToLower();
        var guestRow = await context.UsernameReservations
            .Include(r => r.User)
            .FirstOrDefaultAsync(
                r => r.GuestName != null && r.GuestName.ToLower() == guestKey,
                cancellationToken);
        if (guestRow?.User is not null) return (guestRow.User, false);

        var guestHandle = await SrcUsernames.AllocateHandleAsync(
            context, guestName, guestName, cancellationToken);
        var guest = new User
        {
            Id = Guid.NewGuid(),
            Username = guestHandle,
            DisplayName = SrcUsernames.NeedsDisplayName(guestName, guestHandle)
                ? TrimDisplay(guestName)
                : null,
            IsReserved = true,
            CreatedAt = DateTime.UtcNow,
        };
        context.Users.Add(guest);
        context.UsernameReservations.Add(new UsernameReservation
        {
            Id = Guid.NewGuid(),
            UserId = guest.Id,
            ReservedUsername = guestHandle,
            GuestName = guestName.Length > UsernameReservation.GuestNameMaxLength
                ? guestName[..UsernameReservation.GuestNameMaxLength]
                : guestName,
            ReservedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync(cancellationToken);
        return (guest, true);
    }

    private async Task RecomputeCategoryAsync(Guid categoryId, CancellationToken cancellationToken)
    {
        var verified = await context.Submissions
            .Include(s => s.Variables)
            .ThenInclude(x => x.VariableValue)
            .ThenInclude(v => v!.Variable)
            .Where(s => s.CategoryId == categoryId && s.Status == SubmissionStatus.Verified)
            .ToListAsync(cancellationToken);
        SubmissionObsolescence.RecomputeCategory(verified);
    }

    private static DateTimeOffset ParsePlayedOn(SrcRun run)
    {
        if (DateTimeOffset.TryParse(run.Date, out var date)) return date;
        if (DateTimeOffset.TryParse(run.Submitted, out var submitted)) return submitted;
        return DateTimeOffset.UtcNow;
    }

    private static DateTime? ParseSubmitted(SrcRun run) =>
        DateTime.TryParse(run.Submitted, out var submitted) ? DateTime.SpecifyKind(submitted, DateTimeKind.Utc) : null;

    private static string TrimDisplay(string name) =>
        name.Length > User.DisplayNameMaxLength ? name[..User.DisplayNameMaxLength] : name;

    private static string TrimName(string name, string srcId)
    {
        var suffix = "_" + srcId;
        var budget = Category.NameMaxLength - suffix.Length;
        if (budget < 1) return srcId[..Math.Min(srcId.Length, Category.NameMaxLength)];
        var stem = name.Length > budget ? name[..budget] : name;
        return stem + suffix;
    }

    private static List<Dictionary<string, string>> Cartesian(
        IReadOnlyList<(string SrcId, IReadOnlyList<string> Values)> axes)
    {
        List<Dictionary<string, string>> sets = [[]];
        foreach (var (srcId, values) in axes)
        {
            var next = new List<Dictionary<string, string>>();
            foreach (var prefix in sets)
            foreach (var value in values)
            {
                var row = new Dictionary<string, string>(prefix) { [srcId] = value };
                next.Add(row);
            }

            sets = next;
        }

        return sets;
    }

    private enum ImportOutcome { Inserted, Skipped, Reserved }
}
