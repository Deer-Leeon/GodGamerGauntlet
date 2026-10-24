using System.Collections.Concurrent;
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

public sealed partial class SrcImportService(
    AppDbContext context,
    ISrcClient src,
    IConfiguration configuration,
    ILogger<SrcImportService> logger)
{
    public const string BulkDisabledMessage =
        "Bulk import stays off until SrcImport:BulkEnabled is true.";

    /// <summary>speedrun.com will not return offset 10,000 or higher for one runs query.</summary>
    public const int RunOffsetCap = 10_000;

    public bool BulkEnabled =>
        bool.TryParse(configuration["SrcImport:BulkEnabled"], out var enabled) && enabled;

    /// <summary>
    /// Queues a full run-history import for every enabled catalog game.
    /// Requires <see cref="BulkEnabled"/>. The hosted worker drains the cursors.
    /// </summary>
    public async Task<SrcImportResult> ImportBulkAsync(CancellationToken cancellationToken)
    {
        var status = await StartBulkAsync(cancellationToken);
        var result = new SrcImportResult();
        result.Notes.Add(
            $"Import queued. {status.CursorsOpen} open cursors, {status.RunsStored} runs stored.");
        return result;
    }

    /// <summary>
    /// Imports one game's full run history before returning. Used by tests.
    /// The admin endpoint queues the same work and returns immediately.
    /// </summary>
    public async Task<SrcImportResult> ImportGameAsync(string abbreviation, CancellationToken cancellationToken) =>
        await DrainGameAsync(abbreviation, cancellationToken);

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
        var levels = remote.Levels?.Data ?? [];
        await EnsureLevelsAsync(local.Id, levels, cancellationToken);
        var importedCategories = 0;

        foreach (var srcCategory in categories)
        {
            if (string.IsNullOrWhiteSpace(srcCategory.Id) || string.IsNullOrWhiteSpace(srcCategory.Name)) continue;
            var perLevel = string.Equals(srcCategory.Type, "per-level", StringComparison.OrdinalIgnoreCase);
            if (!perLevel && !string.Equals(srcCategory.Type, "per-game", StringComparison.OrdinalIgnoreCase)) continue;

            var category = await EnsureCategoryAsync(local.Id, srcCategory, cancellationToken);
            var localVars = await EnsureVariablesAsync(category, srcCategory.Id, variables, perLevel, cancellationToken);
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

            if (perLevel)
            {
                var gameLevels = await context.GameLevels
                    .Where(l => l.GameId == local.Id && l.SrcLevelId != null)
                    .ToListAsync(cancellationToken);
                foreach (var level in gameLevels)
                {
                    foreach (var filter in Cartesian(subAxes))
                    {
                        var board = await src.GetLevelLeaderboardAsync(
                            remote.Id, level.SrcLevelId!, srcCategory.Id, filter, cancellationToken);
                        await ImportBoardAsync(
                            local.Id, category, localVars, board, origin, playerSrcId, forcedPlayerId, result, cancellationToken);
                    }
                }
            }
            else
            {
                foreach (var filter in Cartesian(subAxes))
                {
                    var board = await src.GetLeaderboardAsync(remote.Id, srcCategory.Id, filter, cancellationToken);
                    await ImportBoardAsync(
                        local.Id, category, localVars, board, origin, playerSrcId, forcedPlayerId, result, cancellationToken);
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
        if (existing is not null)
        {
            existing.Rules ??= NormalizeRules(srcCategory.Rules);
            existing.Weblink ??= srcCategory.Weblink;
            existing.Type ??= srcCategory.Type;
            existing.Miscellaneous = srcCategory.Miscellaneous;
            existing.PlayersType ??= srcCategory.Players?.Type;
            if (srcCategory.Players is { Value: > 0 }) existing.PlayersValue ??= srcCategory.Players.Value;
            return existing;
        }

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
            Rules = NormalizeRules(srcCategory.Rules),
            Weblink = srcCategory.Weblink,
            Type = srcCategory.Type,
            Miscellaneous = srcCategory.Miscellaneous,
            PlayersType = srcCategory.Players?.Type,
            PlayersValue = srcCategory.Players is { Value: > 0 } ? srcCategory.Players.Value : null,
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
        bool levelBoard,
        CancellationToken cancellationToken)
    {
        var applicable = srcVariables.Where(v => AppliesTo(v, srcCategoryId, levelBoard)).ToList();
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
                var takenNames = await context.Variables
                    .Where(v => v.CategoryId == category.Id)
                    .Select(v => v.Name)
                    .ToListAsync(cancellationToken);
                takenNames.AddRange(context.ChangeTracker.Entries<Variable>()
                    .Where(entry => entry.Entity.CategoryId == category.Id)
                    .Select(entry => entry.Entity.Name));
                variable = new Variable
                {
                    Id = Guid.NewGuid(),
                    CategoryId = category.Id,
                    Name = UniqueLabel(name, srcVar.Id, takenNames, Variable.NameMaxLength),
                    SrcVariableId = srcVar.Id,
                    IsSubcategory = srcVar.IsSubcategory,
                    IsRequired = srcVar.Mandatory,
                    Scope = srcVar.Scope?.Type,
                };
                context.Variables.Add(variable);
            }
            else
            {
                variable.Scope ??= srcVar.Scope?.Type;
            }

            foreach (var (valueId, choice) in srcVar.Values?.Values ?? [])
            {
                if (string.IsNullOrWhiteSpace(choice.Label)) continue;
                var label = choice.Label.Trim();
                if (label.Length > VariableValue.ValueMaxLength) label = label[..VariableValue.ValueMaxLength];

                var exists = variable.Values.Any(x => x.SrcValueId == valueId);
                if (exists)
                {
                    var current = variable.Values.First(x => x.SrcValueId == valueId);
                    current.Rules ??= NormalizeRules(choice.Rules);
                    continue;
                }
                variable.Values.Add(new VariableValue
                {
                    Id = Guid.NewGuid(),
                    VariableId = variable.Id,
                    Value = UniqueLabel(
                        label,
                        valueId,
                        variable.Values.Select(x => x.Value),
                        VariableValue.ValueMaxLength),
                    SrcValueId = valueId,
                    Rules = NormalizeRules(choice.Rules),
                });
            }
        }

        await context.SaveChangesAsync(cancellationToken);

        return await context.Variables
            .Include(v => v.Values)
            .Where(v => v.CategoryId == category.Id)
            .ToListAsync(cancellationToken);
    }

    private static bool AppliesTo(SrcVariable variable, string srcCategoryId, bool levelBoard)
    {
        var scope = variable.Scope?.Type;
        var levelScope = string.Equals(scope, "all-levels", StringComparison.OrdinalIgnoreCase)
            || string.Equals(scope, "single-level", StringComparison.OrdinalIgnoreCase);
        if (levelBoard != levelScope && !string.Equals(scope, "global", StringComparison.OrdinalIgnoreCase) && scope is not null)
        {
            if (levelBoard && string.Equals(scope, "full-game", StringComparison.OrdinalIgnoreCase)) return false;
            if (!levelBoard && levelScope) return false;
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

        var links = ProofUrls.HttpLinks((run.Videos?.Links ?? []).Select(l => l.Uri));
        var video = ProofUrls.FirstAccepted(links) ?? links.FirstOrDefault();
        if (video is null) return ImportOutcome.Skipped;

        var players = run.Players ?? [];
        if (players.Count == 0) return ImportOutcome.Skipped;
        if (onlySrcUserId is not null && !players.Any(p =>
                !string.Equals(p.Rel, "guest", StringComparison.OrdinalIgnoreCase)
                && string.Equals(p.Id, onlySrcUserId, StringComparison.OrdinalIgnoreCase)))
        {
            return ImportOutcome.Skipped;
        }

        var timeMs = (long)Math.Round(run.Times?.PrimaryT * 1000 ?? 0);
        if (timeMs <= 0) return ImportOutcome.Skipped;

        var reserved = false;
        var seated = new List<(SrcPlayer Source, User User)>();
        foreach (var source in players)
        {
            if (forcedPlayerId is Guid forced && seated.Count == 0)
            {
                var forcedUser = await context.Users.FirstAsync(u => u.Id == forced, cancellationToken);
                seated.Add((source, forcedUser));
                continue;
            }

            var (user, created) = await EnsurePlayerAsync(source, cancellationToken);
            if (created) reserved = true;
            seated.Add((source, user));
        }

        var primary = seated[0];
        var playedOn = ParsePlayedOn(run);
        var verifiedAt = ParseSubmittedDate(run.Status?.VerifyDate) ?? DateTime.UtcNow;
        var level = await EnsureRunLevelAsync(gameId, run.Level, cancellationToken);
        var (platformId, platformName) = await ResolveNameAsync(run.System?.Platform, src.GetPlatformNameAsync, cancellationToken);
        var (regionId, regionName) = await ResolveNameAsync(run.System?.Region, src.GetRegionNameAsync, cancellationToken);
        var verifierId = string.IsNullOrWhiteSpace(run.Status?.Examiner) ? null : run.Status.Examiner;
        var verifierName = verifierId is null ? null : await src.GetUserNameAsync(verifierId, cancellationToken);
        var submission = new Submission
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            CategoryId = category.Id,
            LevelId = level?.Id,
            PlayerId = primary.User.Id,
            PrimaryTimeMs = timeMs,
            RealtimeMs = ToMs(run.Times?.RealtimeT),
            IngameMs = ToMs(run.Times?.IngameT),
            VideoUrl = video,
            PlayedOn = playedOn,
            IsEmulator = run.System?.Emulated == true,
            PlatformSrcId = platformId,
            PlatformName = platformName,
            RegionSrcId = regionId,
            RegionName = regionName,
            VerifierSrcId = verifierId,
            VerifierName = verifierName is null ? null : Trim(verifierName, Submission.SrcNameMaxLength),
            SrcWeblink = run.Weblink,
            Status = SubmissionStatus.Verified,
            Origin = origin,
            SrcRunId = run.Id,
            IsObsolete = false,
            SubmittedAt = ParseSubmitted(run) ?? playedOn.UtcDateTime,
            ReviewedAt = verifiedAt,
        };

        for (var i = 0; i < seated.Count; i++)
        {
            var (source, user) = seated[i];
            var guest = string.Equals(source.Rel, "guest", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(source.Id);
            submission.Players.Add(new SubmissionPlayer
            {
                Id = Guid.NewGuid(),
                SubmissionId = submission.Id,
                UserId = user.Id,
                Name = PlayerLabel(source),
                SrcUserId = guest ? null : source.Id,
                IsGuest = guest,
                SortOrder = i,
            });
        }

        for (var i = 0; i < links.Count; i++)
        {
            submission.Proofs.Add(new SubmissionProof
            {
                Id = Guid.NewGuid(),
                SubmissionId = submission.Id,
                Url = links[i],
                SortOrder = i,
            });
        }

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

    private async Task ImportBoardAsync(
        Guid gameId,
        Category category,
        IReadOnlyList<Variable> localVars,
        SrcLeaderboard? board,
        SubmissionOrigin origin,
        string? playerSrcId,
        Guid? forcedPlayerId,
        SrcImportResult result,
        CancellationToken cancellationToken)
    {
        if (board?.Runs is null) return;
        foreach (var row in board.Runs)
        {
            if (row.Run is null) continue;
            var outcome = await TryImportRunAsync(
                gameId, category, localVars, row.Run, origin, playerSrcId, forcedPlayerId, cancellationToken);
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

    private async Task EnsureLevelsAsync(
        Guid gameId, IReadOnlyList<SrcLevel> levels, CancellationToken cancellationToken)
    {
        foreach (var level in levels)
        {
            if (string.IsNullOrWhiteSpace(level.Id) || string.IsNullOrWhiteSpace(level.Name)) continue;
            var row = await context.GameLevels
                .FirstOrDefaultAsync(l => l.SrcLevelId == level.Id, cancellationToken);
            if (row is null)
            {
                context.GameLevels.Add(new GameLevel
                {
                    Id = Guid.NewGuid(),
                    GameId = gameId,
                    Name = Trim(level.Name, GameLevel.NameMaxLength),
                    SrcLevelId = level.Id,
                    Rules = NormalizeRules(level.Rules),
                    Weblink = level.Weblink,
                });
            }
            else
            {
                row.Name = Trim(level.Name, GameLevel.NameMaxLength);
                row.Rules = NormalizeRules(level.Rules) ?? row.Rules;
                row.Weblink ??= level.Weblink;
            }
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task<GameLevel?> EnsureRunLevelAsync(
        Guid gameId, object? level, CancellationToken cancellationToken)
    {
        var srcId = SrcRunIds.AsId(level);
        if (string.IsNullOrWhiteSpace(srcId)) return null;
        var row = await context.GameLevels
            .FirstOrDefaultAsync(l => l.SrcLevelId == srcId, cancellationToken);
        if (row is not null) return row;

        row = new GameLevel
        {
            Id = Guid.NewGuid(),
            GameId = gameId,
            Name = Trim(srcId, GameLevel.NameMaxLength),
            SrcLevelId = srcId,
        };
        context.GameLevels.Add(row);
        await context.SaveChangesAsync(cancellationToken);
        return row;
    }

    private static readonly ConcurrentDictionary<string, string?> ResourceNames = new(StringComparer.Ordinal);

    private async Task<(string? Id, string? Name)> ResolveNameAsync(
        object? value,
        Func<string, CancellationToken, Task<string?>> lookup,
        CancellationToken cancellationToken)
    {
        var (id, name) = ReadRef(value);
        if (id is null || name is not null) return (id, name);
        var cacheKey = lookup.Method.Name + ":" + id;
        if (ResourceNames.TryGetValue(cacheKey, out var cached)) return (id, cached);
        name = await lookup(id, cancellationToken);
        var trimmed = name is null ? null : Trim(name, Submission.SrcNameMaxLength);
        ResourceNames.TryAdd(cacheKey, trimmed);
        return (id, trimmed);
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
        if (DateTimeOffset.TryParse(run.Date, out var date)) return date.ToUniversalTime();
        if (DateTimeOffset.TryParse(run.Submitted, out var submitted)) return submitted.ToUniversalTime();
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

    private static string? NormalizeRules(string? rules)
    {
        if (string.IsNullOrWhiteSpace(rules)) return null;
        var trimmed = rules.Trim();
        const int max = 20_000;
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static string UniqueLabel(string label, string srcId, IEnumerable<string> taken, int maxLength)
    {
        var trimmed = label.Length <= maxLength ? label : label[..maxLength];
        if (!taken.Any(t => t == trimmed)) return trimmed;
        var suffix = " · " + srcId;
        var room = Math.Max(0, maxLength - suffix.Length);
        var stem = label.Length <= room ? label : label[..room];
        return stem + suffix;
    }

    private static string Trim(string value, int max) =>
        value.Length <= max ? value : value[..max];

    private static long? ToMs(double? seconds)
    {
        if (seconds is null or <= 0) return null;
        return (long)Math.Round(seconds.Value * 1000);
    }

    private static string PlayerLabel(SrcPlayer player)
    {
        var name = player.Names?.International ?? player.Name ?? player.Id ?? "Runner";
        return Trim(name, SubmissionPlayer.NameMaxLength);
    }

    private static (string? Id, string? Name) ReadRef(object? value)
    {
        var id = SrcRunIds.AsId(value);
        string? name = null;
        if (value is System.Text.Json.JsonElement el && el.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            name = NameOf(el);
        }

        if (id is { Length: > Submission.SrcRunIdMaxLength }) id = id[..Submission.SrcRunIdMaxLength];
        if (name is { Length: > Submission.SrcNameMaxLength }) name = name[..Submission.SrcNameMaxLength];
        return (string.IsNullOrWhiteSpace(id) ? null : id, string.IsNullOrWhiteSpace(name) ? null : name);
    }

    private static string? NameOf(System.Text.Json.JsonElement el)
    {
        if (el.TryGetProperty("name", out var plain) && plain.ValueKind == System.Text.Json.JsonValueKind.String)
            return plain.GetString();
        if (el.TryGetProperty("names", out var names)
            && names.TryGetProperty("international", out var international)
            && international.ValueKind == System.Text.Json.JsonValueKind.String)
        {
            return international.GetString();
        }

        if (el.TryGetProperty("data", out var data) && data.ValueKind == System.Text.Json.JsonValueKind.Object)
            return NameOf(data);
        return null;
    }

    private static DateTime? ParseSubmittedDate(string? value) =>
        DateTime.TryParse(value, out var parsed) ? DateTime.SpecifyKind(parsed, DateTimeKind.Utc) : null;

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
