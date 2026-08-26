using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Repositories;

public class UserRepository(AppDbContext context) : IUserRepository
{
    public async Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Users
            .AsNoTracking()
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
    }

    public async Task<User?> GetForUpdateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await context.Users
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
    }

    public async Task<User?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        var key = username.Trim().ToLower();
        return await context.Users
            .AsNoTracking()
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(u => u.Username.ToLower() == key, cancellationToken);
    }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var key = email.Trim().ToLower();
        return await context.Users
            .AsNoTracking()
            .Include(u => u.StreamLinks)
            .FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == key, cancellationToken);
    }

    public async Task<User?> GetByLoginAsync(string identifier, CancellationToken cancellationToken = default)
    {
        var key = identifier.Trim();
        if (key.Contains('@'))
        {
            var byEmail = await GetByEmailAsync(key, cancellationToken);
            if (byEmail is not null) return byEmail;
        }

        return await GetByUsernameAsync(key, cancellationToken);
    }

    public async Task<IEnumerable<User>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await context.Users
            .AsNoTracking()
            .OrderBy(u => u.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task<User> AddAsync(User user, CancellationToken cancellationToken = default)
    {
        context.Users.Add(user);
        await context.SaveChangesAsync(cancellationToken);
        return user;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        context.SaveChangesAsync(cancellationToken);
}
