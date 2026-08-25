using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Repositories;

public class RunRepository(AppDbContext context) : IRunRepository
{
    public async Task<IReadOnlyList<LeaderboardEntryDto>> GetLeaderboardAsync(int limit, CancellationToken cancellationToken = default)
    {
        var entries = await context.Runs
            .AsNoTracking()
            .Where(r => r.Status != RunStatus.Active)
            .Select(r => new
            {
                r.Id,
                StreamerName = r.User!.Username,
                r.Status,
                r.EndTime,
                // Earned score: only slots actually won count, using the slot formula.
                TotalScore = r.Slots
                    .Where(s => s.Status == RunSlotStatus.Won)
                    .Sum(s => (double?)(s.Game!.BaseDifficulty * (1 + 0.1 * Math.Pow(s.Position - 1, 2)))) ?? 0,
                SlotsCompleted = r.Slots.Count(s => s.Status == RunSlotStatus.Won)
            })
            .OrderByDescending(x => x.TotalScore)
            .ThenBy(x => x.Status == RunStatus.Completed ? 0 : 1)
            .ThenByDescending(x => x.EndTime)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return entries
            .Select(x => new LeaderboardEntryDto(
                x.Id, x.StreamerName, x.TotalScore, x.Status.ToString(), x.SlotsCompleted, x.EndTime))
            .ToList();
    }

    public async Task<Run?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Runs
            .AsNoTracking()
            .Include(r => r.User)
            .Include(r => r.Slots.OrderBy(s => s.Position))
            .ThenInclude(s => s.Game)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
    }

    public async Task<Run?> GetByIdTrackedAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Runs
            .Include(r => r.User)
            .Include(r => r.Slots.OrderBy(s => s.Position))
            .ThenInclude(s => s.Game)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<Run> AddAsync(Run run, CancellationToken cancellationToken = default)
    {
        context.Runs.Add(run);
        await context.SaveChangesAsync(cancellationToken);
        return run;
    }

    public async Task<bool> UserExistsAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return await context.Users.AnyAsync(u => u.Id == userId, cancellationToken);
    }
}
