using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services;

public class RecordBook(AppDbContext context) : IRecordBook
{
    public async Task<IReadOnlyList<LeaderboardEntryDto>> GetBoardAsync(
        RunType runType,
        int limit,
        CancellationToken cancellationToken = default,
        string? season = null)
    {
        if (!Seasons.TryRange(season, out var start, out var end))
        {
            start = null;
            end = null;
        }

        var board = await LoadBoardAsync(runType, cancellationToken, start, end);
        return board
            .Take(Math.Clamp(limit, 1, 50))
            .Select(ToEntry)
            .ToList();
    }

    public async Task<IReadOnlyList<LeaderboardEntryDto>> GetSurvivalBoardAsync(
        RunType runType,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var dnfs = await context.Runs
            .AsNoTracking()
            .Where(r => r.Status == RunStatus.Failed && r.RunType == runType)
            .Select(r => new
            {
                r.Id,
                r.UserId,
                Username = r.User!.Username,
                r.EndTime,
                Score = r.Slots
                    .Where(s => s.Status == RunSlotStatus.Won)
                    .Sum(s => (double?)s.Game!.BaseDifficulty) ?? 0,
                SlotsCompleted = r.Slots.Count(s => s.Status == RunSlotStatus.Won)
            })
            .ToListAsync(cancellationToken);

        return dnfs
            .GroupBy(d => d.UserId)
            .Select(g => g
                .OrderByDescending(x => x.SlotsCompleted)
                .ThenByDescending(x => x.Score)
                .ThenByDescending(x => x.EndTime)
                .First())
            .OrderByDescending(x => x.SlotsCompleted)
            .ThenByDescending(x => x.Score)
            .ThenByDescending(x => x.EndTime)
            .Take(Math.Clamp(limit, 1, 50))
            .Select((x, index) => new LeaderboardEntryDto(
                x.Id,
                x.UserId,
                x.Username,
                x.Score,
                nameof(RunStatus.Failed),
                runType.ToString(),
                x.SlotsCompleted,
                runType.SlotCount(),
                x.EndTime,
                index + 1))
            .ToList();
    }

    public async Task<IReadOnlyList<SeasonChampionDto>> GetHallOfFameAsync(
        CancellationToken cancellationToken = default)
    {
        var standard = await LoadBoardRowsAsync(RunType.Standard, cancellationToken);
        var lite = await LoadBoardRowsAsync(RunType.Lite, cancellationToken);
        var months = standard.Concat(lite)
            .Where(r => r.EndTime is not null)
            .Select(r => Seasons.MonthStart(r.EndTime!.Value.ToUniversalTime()))
            .Distinct()
            .OrderByDescending(m => m)
            .Take(18)
            .ToList();

        return months
            .Select(month =>
            {
                var next = month.AddMonths(1);
                return new SeasonChampionDto(
                    Seasons.Key(month),
                    Seasons.Label(month),
                    ChampionInMonth(standard, RunType.Standard, month, next),
                    ChampionInMonth(lite, RunType.Lite, month, next));
            })
            .Where(s => s.Standard is not null || s.Lite is not null)
            .ToList();
    }

    public async Task<RunPlacementDto?> GetPlacementAsync(
        Guid runId,
        CancellationToken cancellationToken = default)
    {
        var run = await context.Runs
            .AsNoTracking()
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .FirstOrDefaultAsync(r => r.Id == runId, cancellationToken);

        if (run is null || run.Status == RunStatus.Active)
        {
            return null;
        }

        var board = await LoadBoardAsync(run.RunType, cancellationToken);
        var pb = board.FirstOrDefault(p => p.UserId == run.UserId);
        var score = SlotScores.Earned(run.Slots);
        var won = run.Slots.Count(s => s.Status == RunSlotStatus.Won);
        var isClear = run.Status == RunStatus.Completed;
        var isPb = isClear && pb is not null && pb.RunId == run.Id;
        int? wouldBe = isClear
            ? WouldBeRank(board, run.UserId, score, run.EndTime)
            : null;
        var placeRank = isPb ? pb!.Rank : wouldBe;
        var (nextRank, pointsToNext, nextName) = RivalAhead(board, placeRank, score);

        return new RunPlacementDto(
            run.RunType.ToString(),
            isPb,
            isPb ? pb!.Rank : null,
            board.Count,
            wouldBe,
            board.Count > 0 ? board[0].Score : 0,
            pb?.Score,
            pb?.RunId,
            pb?.Rank,
            RunMoments.RecapTitle(
                run.Status,
                run.RunType,
                won,
                run.RunType.SlotCount(),
                isPb,
                isPb ? pb!.Rank : null,
                wouldBe),
            nextRank,
            pointsToNext,
            nextName);
    }

    public async Task<IReadOnlyDictionary<RunType, IReadOnlyList<PersonalBest>>> GetAllBoardsAsync(
        CancellationToken cancellationToken = default)
    {
        var standard = await LoadBoardAsync(RunType.Standard, cancellationToken);
        var lite = await LoadBoardAsync(RunType.Lite, cancellationToken);
        return new Dictionary<RunType, IReadOnlyList<PersonalBest>>
        {
            [RunType.Standard] = standard,
            [RunType.Lite] = lite
        };
    }

    public async Task<UserProfileDto?> GetProfileAsync(
        string username,
        CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .AsNoTracking()
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(
                u => u.Username.ToLower() == username.ToLower(),
                cancellationToken);
        if (user is null) return null;

        var boards = await GetAllBoardsAsync(cancellationToken);

        var allRuns = await context.Runs
            .AsNoTracking()
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => r.UserId == user.Id)
            .ToListAsync(cancellationToken);

        var finished = allRuns.Where(r => r.Status != RunStatus.Active).ToList();
        var liveRun = allRuns
            .Where(r => r.Status == RunStatus.Active)
            .OrderByDescending(r => r.StartTime)
            .FirstOrDefault();

        var ordered = finished
            .OrderByDescending(r => r.EndTime)
            .Select(r =>
            {
                var slots = r.Slots.OrderBy(s => s.Position).ToList();
                return new FinishedSlice(
                    r.Id,
                    r.Status,
                    r.RunType,
                    r.EndTime,
                    SlotScores.Earned(slots),
                    slots.Count(s => s.Status == RunSlotStatus.Won),
                    r.TimerElapsedMs,
                    slots.Select(s => s.Status.ToString()).ToList(),
                    slots.Select(s => s.Game?.Title ?? "Unknown game").ToList(),
                    slots.Select(s => s.Game?.Thumb).ToList());
            })
            .ToList();

        var firstClearIds = ordered
            .Where(r => r.Status == RunStatus.Completed)
            .GroupBy(r => r.RunType)
            .Select(g => g.OrderBy(r => r.EndTime).First().Id)
            .ToHashSet();

        var runs = ordered
            .Select(run => ToProfileRun(run, user.Id, boards, firstClearIds))
            .ToList();

        var titles = EarnedTitles(
            boards[RunType.Standard],
            boards[RunType.Lite],
            user.Id,
            ordered);

        return new UserProfileDto(
            user.Id,
            user.Username,
            user.CreatedAt,
            ordered.Count == 0 ? null : ordered[0].EndTime,
            ordered.Count,
            ordered.Count(r => r.Status == RunStatus.Completed),
            ordered.Count(r => r.Status == RunStatus.Failed),
            ordered.Sum(r => r.SlotsCompleted),
            titles.FirstOrDefault(),
            titles,
            Catalog(finished, RunSlotStatus.Won),
            Catalog(finished, RunSlotStatus.Lost),
            BuildMode(ordered, RunType.Standard, boards[RunType.Standard], user.Id),
            BuildMode(ordered, RunType.Lite, boards[RunType.Lite], user.Id),
            runs,
            StreamLinkDto.FromUser(user),
            ToLive(liveRun));
    }

    private static ProfileLiveRunDto? ToLive(Run? run)
    {
        if (run is null) return null;

        var slots = run.Slots.OrderBy(s => s.Position).ToList();
        var current = slots.FindIndex(s => s.Status != RunSlotStatus.Won);
        if (current < 0) current = Math.Max(0, slots.Count - 1);
        var currentSlot = slots.ElementAtOrDefault(current);
        return new ProfileLiveRunDto(
            run.Id,
            run.RunType.ToString(),
            slots.Count(s => s.Status == RunSlotStatus.Won),
            run.RunType.SlotCount(),
            current + 1,
            currentSlot?.Game?.Title,
            currentSlot?.Game?.Thumb);
    }

    public async Task<IReadOnlyList<PlayerCardDto>> GetDirectoryAsync(
        CancellationToken cancellationToken = default)
    {
        var users = await context.Users
            .AsNoTracking()
            .Select(u => new { u.Id, u.Username, u.CreatedAt })
            .ToListAsync(cancellationToken);

        var finished = await context.Runs
            .AsNoTracking()
            .Where(r => r.Status != RunStatus.Active)
            .Select(r => new { r.UserId, r.Status, r.EndTime })
            .ToListAsync(cancellationToken);

        var boards = await GetAllBoardsAsync(cancellationToken);
        var standardRank = boards[RunType.Standard].ToDictionary(p => p.UserId, p => p.Rank);
        var liteRank = boards[RunType.Lite].ToDictionary(p => p.UserId, p => p.Rank);
        var byUser = finished.GroupBy(r => r.UserId).ToDictionary(g => g.Key, g => g.ToList());

        return users
            .Select(user =>
            {
                byUser.TryGetValue(user.Id, out var runs);
                var attemptCount = runs?.Count ?? 0;
                return new PlayerCardDto(
                    user.Username,
                    user.CreatedAt,
                    attemptCount,
                    runs?.Count(r => r.Status == RunStatus.Completed) ?? 0,
                    runs?.Count(r => r.Status == RunStatus.Failed) ?? 0,
                    standardRank.TryGetValue(user.Id, out var sr) ? sr : null,
                    liteRank.TryGetValue(user.Id, out var lr) ? lr : null,
                    attemptCount == 0 ? null : runs!.Max(r => r.EndTime));
            })
            .OrderByDescending(p => p.LastRunAt ?? DateTime.MinValue)
            .ThenBy(p => p.Username, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private async Task<IReadOnlyList<PersonalBest>> LoadBoardAsync(
        RunType runType,
        CancellationToken cancellationToken,
        DateTime? seasonStart = null,
        DateTime? seasonEnd = null)
    {
        var rows = await LoadBoardRowsAsync(runType, cancellationToken, seasonStart, seasonEnd);
        return RankPbs(rows, runType);
    }

    private async Task<IReadOnlyList<BoardRow>> LoadBoardRowsAsync(
        RunType runType,
        CancellationToken cancellationToken,
        DateTime? seasonStart = null,
        DateTime? seasonEnd = null)
    {
        var query = context.Runs
            .AsNoTracking()
            .Where(r => r.Status == RunStatus.Completed && r.RunType == runType);

        if (seasonStart is not null && seasonEnd is not null)
        {
            query = query.Where(r => r.EndTime >= seasonStart && r.EndTime < seasonEnd);
        }

        var clears = await query
            .Select(r => new
            {
                r.Id,
                r.UserId,
                Username = r.User!.Username,
                r.EndTime,
                Score = r.Slots
                    .Where(s => s.Status == RunSlotStatus.Won)
                    .Sum(s => (double?)s.Game!.BaseDifficulty) ?? 0,
                SlotsCompleted = r.Slots.Count(s => s.Status == RunSlotStatus.Won)
            })
            .ToListAsync(cancellationToken);

        return clears
            .Select(c => new BoardRow(
                c.Id,
                c.UserId,
                c.Username,
                c.EndTime,
                c.Score,
                c.SlotsCompleted))
            .ToList();
    }

    private static IReadOnlyList<PersonalBest> RankPbs(
        IReadOnlyList<BoardRow> clears,
        RunType runType) =>
        clears
            .GroupBy(c => c.UserId)
            .Select(g => g
                .OrderByDescending(x => x.Score)
                .ThenByDescending(x => x.EndTime)
                .First())
            .OrderByDescending(x => x.Score)
            .ThenByDescending(x => x.EndTime)
            .Select((x, index) => new PersonalBest(
                x.Id,
                x.UserId,
                x.Username,
                runType,
                x.Score,
                x.SlotsCompleted,
                x.EndTime,
                index + 1))
            .ToList();

    /// <summary>
    /// Rank of <paramref name="score"/> if it replaced this user's current PB
    /// (or were their first Clear).
    /// </summary>
    public static int WouldBeRank(
        IReadOnlyList<PersonalBest> board,
        Guid userId,
        double score,
        DateTime? endTime)
    {
        var better = board.Count(p =>
            p.UserId != userId && RanksAhead(p.Score, p.EndTime, score, endTime));
        return better + 1;
    }

    private static bool RanksAhead(
        double otherScore,
        DateTime? otherEnd,
        double score,
        DateTime? endTime)
    {
        if (otherScore > score) return true;
        if (otherScore < score) return false;
        return (otherEnd ?? DateTime.MinValue) > (endTime ?? DateTime.MinValue);
    }

    private static LeaderboardEntryDto ToEntry(PersonalBest pb) =>
        new(
            pb.RunId,
            pb.UserId,
            pb.Username,
            pb.Score,
            nameof(RunStatus.Completed),
            pb.RunType.ToString(),
            pb.SlotsCompleted,
            pb.RunType.SlotCount(),
            pb.EndTime,
            pb.Rank);

    private static ProfileRunDto ToProfileRun(
        FinishedSlice run,
        Guid userId,
        IReadOnlyDictionary<RunType, IReadOnlyList<PersonalBest>> boards,
        HashSet<Guid> firstClearIds)
    {
        var board = boards[run.RunType];
        var pb = board.FirstOrDefault(p => p.UserId == userId);
        var isClear = run.Status == RunStatus.Completed;
        var isPb = isClear && pb is not null && pb.RunId == run.Id;
        return new ProfileRunDto(
            run.Id,
            run.Status.ToString(),
            run.RunType.ToString(),
            run.EndTime,
            run.Score,
            run.SlotsCompleted,
            run.RunType.SlotCount(),
            isPb ? pb!.Rank : null,
            isClear ? WouldBeRank(board, userId, run.Score, run.EndTime) : null,
            run.ElapsedMs,
            run.SlotStatuses,
            run.SlotTitles,
            run.SlotThumbs,
            RunMoments.For(
                run.Status,
                run.RunType,
                run.SlotsCompleted,
                run.RunType.SlotCount(),
                isPb,
                firstClearIds.Contains(run.Id)));
    }

    private static ProfileModeDto BuildMode(
        IReadOnlyList<FinishedSlice> finished,
        RunType runType,
        IReadOnlyList<PersonalBest> board,
        Guid userId)
    {
        var ofType = finished.Where(r => r.RunType == runType).ToList();
        var furthest = ofType
            .OrderByDescending(r => r.SlotsCompleted)
            .ThenByDescending(r => r.EndTime)
            .FirstOrDefault();
        var pb = board.FirstOrDefault(p => p.UserId == userId);

        return new ProfileModeDto(
            ofType.Count,
            ofType.Count(r => r.Status == RunStatus.Completed),
            ofType.Count(r => r.Status == RunStatus.Failed),
            ofType.Sum(r => r.SlotsCompleted),
            furthest?.SlotsCompleted ?? 0,
            runType.SlotCount(),
            pb is null ? null : ToBoardCard(pb, board));
    }

    private static ProfileBoardDto ToBoardCard(
        PersonalBest pb,
        IReadOnlyList<PersonalBest> board)
    {
        var (nextRank, points, name) = RivalAhead(board, pb.Rank, pb.Score);
        return new ProfileBoardDto(
            pb.Rank,
            pb.Score,
            pb.RunId,
            board.Count,
            nextRank,
            points,
            name);
    }

    private static (int? NextRank, double? PointsToNext, string? NextUsername) RivalAhead(
        IReadOnlyList<PersonalBest> board,
        int? rank,
        double score)
    {
        if (rank is null or <= 1 || board.Count == 0) return (null, rank == 1 ? 0 : null, null);
        var above = board.FirstOrDefault(p => p.Rank == rank.Value - 1);
        if (above is null) return (null, null, null);
        return (above.Rank, above.Score - score, above.Username);
    }

    private static LeaderboardEntryDto? ChampionInMonth(
        IReadOnlyList<BoardRow> clears,
        RunType runType,
        DateTime monthStart,
        DateTime monthEnd)
    {
        var inMonth = clears
            .Where(c => c.EndTime >= monthStart && c.EndTime < monthEnd)
            .ToList();
        if (inMonth.Count == 0) return null;
        var champ = RankPbs(inMonth, runType)[0];
        return ToEntry(champ);
    }

    private static IReadOnlyList<ProfileGameDto> Catalog(
        IReadOnlyList<Run> runs,
        RunSlotStatus status) =>
        runs
            .SelectMany(r => r.Slots.Where(s => s.Status == status && s.Game is not null))
            .GroupBy(s => s.GameId)
            .Select(g =>
            {
                var game = g.First().Game!;
                return new ProfileGameDto(g.Key, game.Title, game.Thumb, g.Count());
            })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Title, StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();

    private static IReadOnlyList<string> EarnedTitles(
        IReadOnlyList<PersonalBest> standard,
        IReadOnlyList<PersonalBest> lite,
        Guid userId,
        IReadOnlyList<FinishedSlice> runs)
    {
        var titles = new List<string>();
        var std = standard.FirstOrDefault(p => p.UserId == userId);
        var litePb = lite.FirstOrDefault(p => p.UserId == userId);
        if (std?.Rank == 1) titles.Add("God Gamer");
        if (litePb?.Rank == 1) titles.Add("Lite Champion");
        if (std is { Rank: <= 3 }) titles.Add("Podium");
        if (runs.Any(r => r.Status == RunStatus.Completed && r.RunType == RunType.Standard))
            titles.Add("Standard Clear");
        if (runs.Any(r => r.Status == RunStatus.Completed && r.RunType == RunType.Lite))
            titles.Add("Lite Clear");
        if (runs.Any(r => r.RunType == RunType.Standard && r.SlotsCompleted >= 7))
            titles.Add("Deep Run");
        if (runs.Any(r => r.Status == RunStatus.Failed && r.SlotsCompleted == 0))
            titles.Add("First Blood");
        if (runs.Count > 0 && titles.Count == 0) titles.Add("Challenger");
        return titles;
    }

    private sealed record BoardRow(
        Guid Id,
        Guid UserId,
        string Username,
        DateTime? EndTime,
        double Score,
        int SlotsCompleted);

    private sealed record FinishedSlice(
        Guid Id,
        RunStatus Status,
        RunType RunType,
        DateTime? EndTime,
        double Score,
        int SlotsCompleted,
        long ElapsedMs,
        IReadOnlyList<string> SlotStatuses,
        IReadOnlyList<string> SlotTitles,
        IReadOnlyList<string?> SlotThumbs);
}
