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
        CancellationToken cancellationToken = default)
    {
        var board = await LoadBoardAsync(runType, cancellationToken);
        return board
            .Take(Math.Clamp(limit, 1, 50))
            .Select(ToEntry)
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
        var isClear = run.Status == RunStatus.Completed;
        var isPb = isClear && pb is not null && pb.RunId == run.Id;
        int? wouldBe = isClear
            ? WouldBeRank(board, run.UserId, score, run.EndTime)
            : null;

        return new RunPlacementDto(
            run.RunType.ToString(),
            isPb,
            isPb ? pb!.Rank : null,
            board.Count,
            wouldBe,
            board.Count > 0 ? board[0].Score : 0,
            pb?.Score,
            pb?.RunId,
            pb?.Rank);
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
            .FirstOrDefaultAsync(
                u => u.Username.ToLower() == username.ToLower(),
                cancellationToken);
        if (user is null) return null;

        var boards = await GetAllBoardsAsync(cancellationToken);
        var standardPb = boards[RunType.Standard].FirstOrDefault(p => p.UserId == user.Id);
        var litePb = boards[RunType.Lite].FirstOrDefault(p => p.UserId == user.Id);

        var finished = await context.Runs
            .AsNoTracking()
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => r.UserId == user.Id && r.Status != RunStatus.Active)
            .ToListAsync(cancellationToken);

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

        var runs = ordered
            .Select(run => ToProfileRun(run, user.Id, boards))
            .ToList();

        return new UserProfileDto(
            user.Id,
            user.Username,
            user.CreatedAt,
            ordered.Count == 0 ? null : ordered[0].EndTime,
            ordered.Count,
            ordered.Count(r => r.Status == RunStatus.Completed),
            ordered.Count(r => r.Status == RunStatus.Failed),
            ordered.Sum(r => r.SlotsCompleted),
            BuildMode(ordered, RunType.Standard, standardPb, boards[RunType.Standard].Count),
            BuildMode(ordered, RunType.Lite, litePb, boards[RunType.Lite].Count),
            runs);
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
        CancellationToken cancellationToken)
    {
        var clears = await context.Runs
            .AsNoTracking()
            .Where(r => r.Status == RunStatus.Completed && r.RunType == runType)
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
    }

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
        IReadOnlyDictionary<RunType, IReadOnlyList<PersonalBest>> boards)
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
            run.SlotThumbs);
    }

    private static ProfileModeDto BuildMode(
        IReadOnlyList<FinishedSlice> finished,
        RunType runType,
        PersonalBest? pb,
        int boardSize)
    {
        var ofType = finished.Where(r => r.RunType == runType).ToList();
        var furthest = ofType
            .OrderByDescending(r => r.SlotsCompleted)
            .ThenByDescending(r => r.EndTime)
            .FirstOrDefault();

        return new ProfileModeDto(
            ofType.Count,
            ofType.Count(r => r.Status == RunStatus.Completed),
            ofType.Count(r => r.Status == RunStatus.Failed),
            ofType.Sum(r => r.SlotsCompleted),
            furthest?.SlotsCompleted ?? 0,
            runType.SlotCount(),
            pb is null
                ? null
                : new ProfileBoardDto(pb.Rank, pb.Score, pb.RunId, boardSize));
    }

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
