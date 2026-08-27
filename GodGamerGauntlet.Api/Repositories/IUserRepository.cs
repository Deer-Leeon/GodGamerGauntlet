using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Repositories;

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    Task<User?> GetForUpdateAsync(Guid id, CancellationToken cancellationToken = default);

    Task<User?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default);

    Task<User?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<User?> GetByLoginAsync(string identifier, CancellationToken cancellationToken = default);

    Task<IEnumerable<User>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<User> AddAsync(User user, CancellationToken cancellationToken = default);

    Task ReplaceStreamLinksAsync(
        Guid userId,
        IReadOnlyList<(string Platform, string Url)> links,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Guid>> GetFollowingIdsAsync(
        Guid followerId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<User>> GetFollowingUsersAsync(
        Guid followerId,
        CancellationToken cancellationToken = default);

    Task<bool> IsFollowingAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default);

    Task<bool> FollowAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default);

    Task<bool> UnfollowAsync(
        Guid followerId,
        Guid followedId,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
