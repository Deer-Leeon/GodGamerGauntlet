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
        var standard = boards[RunType.Standard].FirstOrDefault(p => p.UserId == user.Id);
        var lite = boards[RunType.Lite].FirstOrDefault(p => p.UserId == user.Id);

        var finished = await context.Runs
            .AsNoTracking()
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => r.UserId == user.Id && r.Status != RunStatus.Active)
            .OrderByDescending(r => r.EndTime)
            .Take(20)
            .ToListAsync(cancellationToken);

        var clearCount = await context.Runs.CountAsync(
            r => r.UserId == user.Id && r.Status == RunStatus.Completed,
            cancellationToken);
        var dnfCount = await context.Runs.CountAsync(
            r => r.UserId == user.Id && r.Status == RunStatus.Failed,
            cancellationToken);

        var recent = finished.Select(run =>
        {
            var board = boards[run.RunType];
            var pb = board.FirstOrDefault(p => p.UserId == run.UserId);
            var isClear = run.Status == RunStatus.Completed;
            var isPb = isClear && pb is not null && pb.RunId == run.Id;
            var score = SlotScores.Earned(run.Slots);
            return new ProfileRunDto(
                run.Id,
                run.Status.ToString(),
                run.RunType.ToString(),
                run.EndTime,
                score,
                run.Slots.Count(s => s.Status == RunSlotStatus.Won),
                run.RunType.SlotCount(),
                isPb ? pb!.Rank : null,
                isClear ? WouldBeRank(board, run.UserId, score, run.EndTime) : null);
        }).ToList();

        return new UserProfileDto(
            user.Id,
            user.Username,
            user.CreatedAt,
            standard is null
                ? null
                : new ProfileBoardDto(standard.Rank, standard.Score, standard.RunId, boards[RunType.Standard].Count),
            lite is null
                ? null
                : new ProfileBoardDto(lite.Rank, lite.Score, lite.RunId, boards[RunType.Lite].Count),
            clearCount,
            dnfCount,
            recent);
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
}
