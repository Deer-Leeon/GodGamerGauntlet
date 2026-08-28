using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

/// <summary>The caller's in-app alert inbox. Strictly private to the JWT owner.</summary>
[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController(AppDbContext context) : ControllerBase
{
    private Guid CurrentUserId =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<NotificationDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        var notifications = await context.Notifications
            .AsNoTracking()
            .Where(n => n.UserId == CurrentUserId)
            .OrderByDescending(n => n.CreatedAt)
            .Take(50)
            .Select(n => new NotificationDto(n.Id, n.Message, n.ActionUrl, n.IsRead, n.CreatedAt))
            .ToListAsync(cancellationToken);

        return Ok(notifications);
    }

    [HttpPut("{id:guid}/read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken cancellationToken)
    {
        // Scoped to the caller: someone else's notification is a 404, not a 403,
        // so ids can't be probed for existence.
        var notification = await context.Notifications
            .FirstOrDefaultAsync(n => n.Id == id && n.UserId == CurrentUserId, cancellationToken);
        if (notification is null) return NotFound();

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            await context.SaveChangesAsync(cancellationToken);
        }

        return NoContent();
    }
}
