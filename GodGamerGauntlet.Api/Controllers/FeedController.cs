using System.Security.Claims;
using GodGamerGauntlet.Api.Contracts;
using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Controllers;

[ApiController]
[Route("api")]
public class FeedController(AppDbContext context, IRecordBook recordBook) : ControllerBase
{
    private const int PageSize = 20;

    /// <summary>How many recent runs compete for the Hot ranking.</summary>
    private const int HotWindow = 200;

    private Guid? CurrentUserId =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    /// <summary>
    /// The community feed: every finished run is a post. Public; when a JWT is
    /// sent the response includes the viewer's own vote and reactions.
    /// </summary>
    [HttpGet("feed")]
    [ProducesResponseType(typeof(FeedPageDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetFeed(
        [FromQuery] string sort = "hot",
        [FromQuery] int page = 1,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);

        var finished = context.Runs
            .AsNoTracking()
            .Where(r => r.Status != RunStatus.Active);

        List<Guid> pageIds;
        bool hasMore;

        switch (sort.ToLowerInvariant())
        {
            case "new":
            {
                var ids = await finished
                    .OrderByDescending(r => r.EndTime)
                    .Skip((page - 1) * PageSize)
                    .Take(PageSize + 1)
                    .Select(r => r.Id)
                    .ToListAsync(cancellationToken);
                hasMore = ids.Count > PageSize;
                pageIds = ids.Take(PageSize).ToList();
                break;
            }
            case "top":
            {
                var ids = await finished
                    .OrderByDescending(r => r.Votes.Sum(v => (int?)v.Value) ?? 0)
                    .ThenByDescending(r => r.EndTime)
                    .Skip((page - 1) * PageSize)
                    .Take(PageSize + 1)
                    .Select(r => r.Id)
                    .ToListAsync(cancellationToken);
                hasMore = ids.Count > PageSize;
                pageIds = ids.Take(PageSize).ToList();
                break;
            }
            default: // hot
            {
                // Rank the most recent window in memory: vote score decayed by age,
                // the classic score / (hours + 2)^1.5 gravity curve.
                var candidates = await finished
                    .OrderByDescending(r => r.EndTime)
                    .Take(HotWindow)
                    .Select(r => new
                    {
                        r.Id,
                        r.EndTime,
                        VoteScore = r.Votes.Sum(v => (int?)v.Value) ?? 0
                    })
                    .ToListAsync(cancellationToken);

                var now = DateTime.UtcNow;
                var ranked = candidates
                    .OrderByDescending(c =>
                    {
                        var hours = Math.Max(0, (now - (c.EndTime ?? now)).TotalHours);
                        return c.VoteScore / Math.Pow(hours + 2, 1.5);
                    })
                    .ThenByDescending(c => c.EndTime)
                    .Select(c => c.Id)
                    .ToList();

                hasMore = ranked.Count > page * PageSize;
                pageIds = ranked.Skip((page - 1) * PageSize).Take(PageSize).ToList();
                break;
            }
        }

        if (pageIds.Count == 0)
        {
            var emptyLive = page == 1
                ? await LoadLiveAsync(cancellationToken)
                : [];
            return Ok(new FeedPageDto([], page, false, emptyLive));
        }

        var posts = await BuildPostsAsync(pageIds, cancellationToken);
        var live = page == 1
            ? await LoadLiveAsync(cancellationToken)
            : [];
        return Ok(new FeedPageDto(posts, page, hasMore, live));
    }

    /// <summary>One finished run as a feed post — used by the run detail page.</summary>
    [HttpGet("runs/{id:guid}/post")]
    [ProducesResponseType(typeof(FeedPostDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPost(Guid id, CancellationToken cancellationToken)
    {
        if (!await context.Runs.AnyAsync(r => r.Id == id, cancellationToken))
        {
            return NotFound("Run not found.");
        }

        var posts = await BuildPostsAsync([id], cancellationToken);
        return posts.Count == 0 ? NotFound() : Ok(posts[0]);
    }

    [HttpPut("runs/{id:guid}/vote")]
    [Authorize]
    [ProducesResponseType(typeof(VoteResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Vote(Guid id, VoteRequest request, CancellationToken cancellationToken)
    {
        if (request.Value is not (-1 or 0 or 1))
        {
            return BadRequest("value must be -1, 0, or 1.");
        }

        var userId = CurrentUserId!.Value;

        if (!await FinishedRunExistsAsync(id, cancellationToken))
        {
            return NotFound("Run not found or not finished yet.");
        }

        var existing = await context.RunVotes
            .FirstOrDefaultAsync(v => v.RunId == id && v.UserId == userId, cancellationToken);

        if (request.Value == 0)
        {
            if (existing is not null)
            {
                context.RunVotes.Remove(existing);
            }
        }
        else if (existing is null)
        {
            context.RunVotes.Add(new RunVote
            {
                Id = Guid.NewGuid(),
                RunId = id,
                UserId = userId,
                Value = request.Value,
                CreatedAt = DateTime.UtcNow
            });
        }
        else
        {
            existing.Value = request.Value;
        }

        await context.SaveChangesAsync(cancellationToken);

        var score = await context.RunVotes
            .Where(v => v.RunId == id)
            .SumAsync(v => (int?)v.Value, cancellationToken) ?? 0;

        return Ok(new VoteResponse(score, request.Value));
    }

    [HttpPost("runs/{id:guid}/reactions/toggle")]
    [Authorize]
    [ProducesResponseType(typeof(ReactionsResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ToggleReaction(
        Guid id, ReactionToggleRequest request, CancellationToken cancellationToken)
    {
        if (!RunReaction.AllowedTypes.Contains(request.Type))
        {
            return BadRequest($"type must be one of: {string.Join(", ", RunReaction.AllowedTypes)}.");
        }

        var userId = CurrentUserId!.Value;

        if (!await context.Runs.AnyAsync(r => r.Id == id, cancellationToken))
        {
            return NotFound("Run not found.");
        }

        var existing = await context.RunReactions.FirstOrDefaultAsync(
            x => x.RunId == id && x.UserId == userId && x.Type == request.Type, cancellationToken);

        if (existing is not null)
        {
            context.RunReactions.Remove(existing);
        }
        else
        {
            context.RunReactions.Add(new RunReaction
            {
                Id = Guid.NewGuid(),
                RunId = id,
                UserId = userId,
                Type = request.Type,
                CreatedAt = DateTime.UtcNow
            });
        }

        await context.SaveChangesAsync(cancellationToken);

        var all = await context.RunReactions
            .Where(x => x.RunId == id)
            .Select(x => new { x.Type, x.UserId })
            .ToListAsync(cancellationToken);

        return Ok(new ReactionsResponse(
            all.GroupBy(x => x.Type).ToDictionary(g => g.Key, g => g.Count()),
            all.Where(x => x.UserId == userId).Select(x => x.Type).ToList()));
    }

    [HttpGet("runs/{id:guid}/comments")]
    [ProducesResponseType(typeof(IEnumerable<CommentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetComments(Guid id, CancellationToken cancellationToken)
    {
        var comments = await context.RunComments
            .AsNoTracking()
            .Include(c => c.User)
            .Where(c => c.RunId == id)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(cancellationToken);

        return Ok(comments.Select(CommentDto.FromEntity));
    }

    [HttpPost("runs/{id:guid}/comments")]
    [Authorize]
    [ProducesResponseType(typeof(CommentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AddComment(
        Guid id, CreateCommentRequest request, CancellationToken cancellationToken)
    {
        var body = request.Body.Trim();
        if (body.Length == 0)
        {
            return BadRequest("Comment body cannot be empty.");
        }

        var userId = CurrentUserId!.Value;

        if (!await FinishedRunExistsAsync(id, cancellationToken))
        {
            return NotFound("Run not found or not finished yet.");
        }

        var comment = new RunComment
        {
            Id = Guid.NewGuid(),
            RunId = id,
            UserId = userId,
            Body = body,
            CreatedAt = DateTime.UtcNow
        };

        context.RunComments.Add(comment);
        await context.SaveChangesAsync(cancellationToken);

        var username = await context.Users
            .Where(u => u.Id == userId)
            .Select(u => u.Username)
            .FirstAsync(cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            new CommentDto(comment.Id, userId, username, comment.Body, comment.CreatedAt));
    }

    [HttpPut("runs/{id:guid}/comments/{commentId:guid}")]
    [Authorize]
    [ProducesResponseType(typeof(CommentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> EditComment(
        Guid id, Guid commentId, CreateCommentRequest request, CancellationToken cancellationToken)
    {
        var body = request.Body.Trim();
        if (body.Length == 0)
        {
            return BadRequest("Comment body cannot be empty.");
        }

        var comment = await context.RunComments
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == commentId && c.RunId == id, cancellationToken);

        if (comment is null)
        {
            return NotFound("Comment not found.");
        }

        if (comment.UserId != CurrentUserId)
        {
            return Forbid();
        }

        comment.Body = body;
        await context.SaveChangesAsync(cancellationToken);

        return Ok(CommentDto.FromEntity(comment));
    }

    [HttpDelete("runs/{id:guid}/comments/{commentId:guid}")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteComment(
        Guid id, Guid commentId, CancellationToken cancellationToken)
    {
        var comment = await context.RunComments
            .FirstOrDefaultAsync(c => c.Id == commentId && c.RunId == id, cancellationToken);

        if (comment is null)
        {
            return NotFound("Comment not found.");
        }

        if (comment.UserId != CurrentUserId)
        {
            return Forbid();
        }

        context.RunComments.Remove(comment);
        await context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private Task<bool> FinishedRunExistsAsync(Guid runId, CancellationToken cancellationToken) =>
        context.Runs.AnyAsync(r => r.Id == runId && r.Status != RunStatus.Active, cancellationToken);

    /// <summary>Hydrates full post cards for a page of run ids, preserving order.</summary>
    private async Task<List<FeedPostDto>> BuildPostsAsync(
        List<Guid> runIds, CancellationToken cancellationToken)
    {
        var viewerId = CurrentUserId;

        var runs = await context.Runs
            .AsNoTracking()
            .Include(r => r.User)
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => runIds.Contains(r.Id))
            .ToListAsync(cancellationToken);

        var votes = await context.RunVotes
            .AsNoTracking()
            .Where(v => runIds.Contains(v.RunId))
            .Select(v => new { v.RunId, v.UserId, v.Value })
            .ToListAsync(cancellationToken);

        var commentCounts = await context.RunComments
            .AsNoTracking()
            .Where(c => runIds.Contains(c.RunId))
            .GroupBy(c => c.RunId)
            .Select(g => new { RunId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.RunId, g => g.Count, cancellationToken);

        var reactions = await context.RunReactions
            .AsNoTracking()
            .Where(x => runIds.Contains(x.RunId))
            .Select(x => new { x.RunId, x.UserId, x.Type })
            .ToListAsync(cancellationToken);

        var votesByRun = votes.ToLookup(v => v.RunId);
        var reactionsByRun = reactions.ToLookup(x => x.RunId);
        var runsById = runs.ToDictionary(r => r.Id);
        var boards = await recordBook.GetAllBoardsAsync(cancellationToken);
        var userIds = runs.Select(r => r.UserId).Distinct().ToList();
        var clears = await context.Runs
            .AsNoTracking()
            .Where(r => r.Status == RunStatus.Completed && userIds.Contains(r.UserId))
            .Select(r => new { r.Id, r.UserId, r.RunType, r.EndTime })
            .ToListAsync(cancellationToken);
        var firstClearIds = clears
            .GroupBy(c => (c.UserId, c.RunType))
            .Select(g => g.OrderBy(x => x.EndTime).ThenBy(x => x.Id).First().Id)
            .ToHashSet();

        var posts = new List<FeedPostDto>(runIds.Count);
        foreach (var runId in runIds)
        {
            if (!runsById.TryGetValue(runId, out var run)) continue;

            var slots = run.Slots.OrderBy(s => s.Position).ToList();
            var earnedScore = SlotScores.Earned(slots);
            var won = slots.Count(s => s.Status == RunSlotStatus.Won);
            var totalSlots = run.RunType.SlotCount();

            int? boardRank = null;
            int? wouldBeRank = null;
            var isPb = false;
            if (run.Status == RunStatus.Completed)
            {
                var board = boards.GetValueOrDefault(run.RunType) ?? [];
                var pb = board.FirstOrDefault(p => p.UserId == run.UserId);
                isPb = pb is not null && pb.RunId == run.Id;
                boardRank = isPb ? pb!.Rank : null;
                wouldBeRank = RecordBook.WouldBeRank(board, run.UserId, earnedScore, run.EndTime);
            }

            var runVotes = votesByRun[runId].ToList();
            var runReactions = reactionsByRun[runId].ToList();

            posts.Add(new FeedPostDto(
                run.Id,
                run.UserId,
                run.User?.Username ?? "unknown",
                run.Status.ToString(),
                run.RunType.ToString(),
                run.EndTime,
                earnedScore,
                won,
                totalSlots,
                slots.Select(s => s.Status.ToString()).ToList(),
                slots.Select(s => s.Game?.Title ?? "Unknown game").ToList(),
                slots.Select(s => s.Game?.Thumb).ToList(),
                run.TimerElapsedMs,
                slots.Select(s => s.SplitTimeMs).ToList(),
                runVotes.Sum(v => v.Value),
                viewerId is null ? 0 : runVotes.FirstOrDefault(v => v.UserId == viewerId)?.Value ?? 0,
                commentCounts.GetValueOrDefault(runId),
                runReactions.GroupBy(x => x.Type).ToDictionary(g => g.Key, g => g.Count()),
                viewerId is null
                    ? []
                    : runReactions.Where(x => x.UserId == viewerId).Select(x => x.Type).ToList(),
                boardRank,
                wouldBeRank,
                RunMoments.For(
                    run.Status,
                    run.RunType,
                    won,
                    totalSlots,
                    isPb,
                    firstClearIds.Contains(run.Id))));
        }

        return posts;
    }

    private async Task<IReadOnlyList<LiveRunDto>> LoadLiveAsync(CancellationToken cancellationToken)
    {
        var live = await context.Runs
            .AsNoTracking()
            .Include(r => r.User)
            .ThenInclude(u => u!.StreamLinks)
            .Include(r => r.Slots)
            .ThenInclude(s => s.Game)
            .Where(r => r.Status == RunStatus.Active)
            .OrderByDescending(r => r.StartTime)
            .Take(8)
            .ToListAsync(cancellationToken);

        return live.Select(LiveRunRules.FromRun).ToList();
    }
}
