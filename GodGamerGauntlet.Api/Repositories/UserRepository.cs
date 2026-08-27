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

    public async Task ReplaceStreamLinksAsync(
        Guid userId,
        IReadOnlyList<(string Platform, string Url)> links,
        CancellationToken cancellationToken = default)
    {
        var existing = await context.UserStreamLinks
            .Where(l => l.UserId == userId)
            .ToListAsync(cancellationToken);
        context.UserStreamLinks.RemoveRange(existing);

        for (var i = 0; i < links.Count; i++)
        {
            context.UserStreamLinks.Add(new UserStreamLink
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Platform = links[i].Platform,
                Url = links[i].Url,
                SortOrder = i,
            });
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Guid>> GetFollowingIdsAsync(
        Guid followerId,
        CancellationToken cancellationToken = default)
    {
        return await context.UserFollows
            .AsNoTracking()
            .Where(f => f.FollowerId == followerId)
            .OrderBy(f => f.CreatedAt)
            .Select(f => f.FollowedId)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<User>> GetFollowingUsersAsync(
        Guid followerId,
        CancellationToken cancellationToken = default)
    {
        return await context.UserFollows
            .AsNoTracking()
            .Where(f => f.FollowerId == followerId)
            .OrderBy(f => f.CreatedAt)
            .Join(
                context.Users.AsNoTracking(),
                follow => follow.FollowedId,
                user => user.Id,
                (_, user) => user)
            .ToListAsync(cancellationToken);
    }

    public Task<bool> IsFollowingAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default) =>
        context.UserFollows.AnyAsync(
            f => f.FollowerId == followerId && f.FollowedId == followedId,
            cancellationToken);

    public async Task<bool> FollowAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default)
    {
        if (followerId == followedId) return false;
        if (await IsFollowingAsync(followerId, followedId, cancellationToken)) return true;

        context.UserFollows.Add(new UserFollow
        {
            Id = Guid.NewGuid(),
            FollowerId = followerId,
            FollowedId = followedId,
            CreatedAt = DateTime.UtcNow,
        });
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> UnfollowAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default)
    {
        var row = await context.UserFollows.FirstOrDefaultAsync(
            f => f.FollowerId == followerId && f.FollowedId == followedId,
            cancellationToken);
        if (row is null) return false;
        context.UserFollows.Remove(row);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        context.SaveChangesAsync(cancellationToken);
}
