using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Repositories;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api/sidebar")]
public class SidebarController(AppDbContext context, IUserRepository userRepository) : ControllerBase
{
    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    [HttpGet]
    [ProducesResponseType(typeof(SidebarDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var liveRuns = await context.Runs
            .AsNoTracking()
            .Include(r => r.User)
            .ThenInclude(u => u!.StreamLinks)
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => r.Status == RunStatus.Active)
            .OrderByDescending(r => r.StartTime)
            .ToListAsync(cancellationToken);

        var live = liveRuns.Select(LiveRunRules.FromRun).ToList();
        var liveByUser = live
            .GroupBy(row => row.UserId)
            .ToDictionary(g => g.Key, g => g.First());

        IReadOnlyList<SidebarFollowedDto> followed = [];
        var followedIds = new HashSet<Guid>();
        if (CurrentUserId is Guid viewerId)
        {
            var people = await userRepository.GetFollowingUsersAsync(viewerId, cancellationToken);
            followedIds = people.Select(u => u.Id).ToHashSet();
            followed = people
                .Select(user => new SidebarFollowedDto(
                    user.Username,
                    liveByUser.TryGetValue(user.Id, out var row) ? row : null))
                .OrderByDescending(row => row.Live is not null)
                .ThenBy(row => row.Username, StringComparer.OrdinalIgnoreCase)
                .Take(40)
                .ToList();
        }

        var strangers = live
            .Where(row => !followedIds.Contains(row.UserId) && row.UserId != CurrentUserId)
            .ToList();

        var bestRuns = strangers
            .Where(LiveRunRules.IsFarAlong)
            .OrderByDescending(row => (double)row.CurrentSlot / Math.Max(1, row.TotalSlots))
            .ThenByDescending(row => row.SlotsCompleted)
            .Take(8)
            .ToList();

        var bestIds = bestRuns.Select(row => row.RunId).ToHashSet();
        var otherLive = strangers
            .Where(row => !bestIds.Contains(row.RunId))
            .Take(12)
            .ToList();

        return Ok(new SidebarDto(followed, otherLive, bestRuns));
    }
}
