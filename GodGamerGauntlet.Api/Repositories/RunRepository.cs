using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Repositories;

public class RunRepository(AppDbContext context) : IRunRepository
{
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
