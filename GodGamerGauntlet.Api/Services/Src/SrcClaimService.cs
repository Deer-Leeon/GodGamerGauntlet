using GodGamerGauntlet.Api.Data;
using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Services.Src;

public sealed class SrcClaimResult
{
    public required string Username { get; init; }
    public required string SrcUserId { get; init; }
    public int RunsImported { get; init; }
    public bool TookReservedHandle { get; init; }
}

public sealed class SrcClaimService(
    AppDbContext context,
    ISrcClient src,
    SrcImportService importer)
{
    public async Task<SrcClaimResult?> ClaimWithApiKeyAsync(
        Guid claimantId, string apiKey, CancellationToken cancellationToken)
    {
        var profile = await src.GetProfileAsync(apiKey, cancellationToken);
        if (profile?.Id is null) return null;

        var international = profile.Names?.International ?? profile.Id;
        return await AttachAsync(
            claimantId,
            profile.Id,
            international,
            UsernameReservation.MethodApiKey,
            cancellationToken);
    }

    public async Task<SrcClaimResult> AdminGrantAsync(
        Guid claimantId,
        User reserved,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(reserved.SrcUserId) && reserved.IsReserved)
        {
            return await MergeGuestAsync(
                claimantId, reserved, UsernameReservation.MethodAdminGrant, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(reserved.SrcUserId))
        {
            throw new InvalidOperationException("That account is not linked to a speedrun.com user.");
        }

        var name = reserved.DisplayName ?? reserved.Username;
        return await AttachAsync(
            claimantId,
            reserved.SrcUserId,
            name,
            UsernameReservation.MethodAdminGrant,
            cancellationToken);
    }

    private async Task<SrcClaimResult> AttachAsync(
        Guid claimantId,
        string srcUserId,
        string internationalName,
        string method,
        CancellationToken cancellationToken)
    {
        var claimant = await context.Users
            .FirstOrDefaultAsync(u => u.Id == claimantId, cancellationToken)
            ?? throw new InvalidOperationException("Account not found.");

        if (claimant.IsReserved)
        {
            throw new InvalidOperationException("Reserved profiles cannot claim.");
        }

        if (claimant.SrcUserId is not null
            && !claimant.SrcUserId.Equals(srcUserId, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("This account is already linked to a different speedrun.com user.");
        }

        var reserved = await context.Users
            .FirstOrDefaultAsync(u => u.SrcUserId == srcUserId, cancellationToken);

        var tookHandle = false;
        if (reserved is not null && reserved.Id != claimant.Id)
        {
            if (!reserved.IsReserved)
            {
                throw new InvalidOperationException(
                    "That speedrun.com account is already claimed by another user.");
            }

            tookHandle = await MergeReservedIntoAsync(claimant, reserved, cancellationToken);
        }

        claimant.SrcUserId = srcUserId;
        claimant.IsReserved = false;
        if (SrcUsernames.NeedsDisplayName(internationalName, claimant.Username)
            && string.IsNullOrWhiteSpace(claimant.DisplayName))
        {
            claimant.DisplayName = internationalName.Length > User.DisplayNameMaxLength
                ? internationalName[..User.DisplayNameMaxLength]
                : internationalName;
        }

        await MarkReservationsClaimedAsync(claimant.Id, srcUserId, method, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);

        var imported = await importer.ImportClaimantPbsAsync(srcUserId, claimant.Id, cancellationToken);

        return new SrcClaimResult
        {
            Username = claimant.Username,
            SrcUserId = srcUserId,
            RunsImported = imported,
            TookReservedHandle = tookHandle,
        };
    }

    private async Task<SrcClaimResult> MergeGuestAsync(
        Guid claimantId,
        User reserved,
        string method,
        CancellationToken cancellationToken)
    {
        var claimant = await context.Users.FirstAsync(u => u.Id == claimantId, cancellationToken);
        if (!reserved.IsReserved)
        {
            throw new InvalidOperationException("That profile is not a reserved guest.");
        }

        var tookHandle = await MergeReservedIntoAsync(claimant, reserved, cancellationToken);
        await MarkReservationsClaimedAsync(claimant.Id, srcUserId: null, method, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return new SrcClaimResult
        {
            Username = claimant.Username,
            SrcUserId = claimant.SrcUserId ?? "",
            RunsImported = 0,
            TookReservedHandle = tookHandle,
        };
    }

    private async Task<bool> MergeReservedIntoAsync(
        User claimant, User reserved, CancellationToken cancellationToken)
    {
        await context.Submissions
            .Where(s => s.PlayerId == reserved.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.PlayerId, claimant.Id), cancellationToken);

        var inbound = await context.UserFollows
            .Where(f => f.FollowedId == reserved.Id)
            .ToListAsync(cancellationToken);
        foreach (var follow in inbound)
        {
            if (follow.FollowerId == claimant.Id)
            {
                context.UserFollows.Remove(follow);
            }
            else
            {
                follow.FollowedId = claimant.Id;
            }
        }

        await context.UserFollows
            .Where(f => f.FollowerId == reserved.Id)
            .ExecuteDeleteAsync(cancellationToken);
        await context.Notifications
            .Where(n => n.UserId == reserved.Id)
            .ExecuteDeleteAsync(cancellationToken);

        var tookHandle = false;
        var desired = reserved.Username;
        var display = reserved.DisplayName;
        if (!desired.Equals(claimant.Username, StringComparison.OrdinalIgnoreCase))
        {
            var taken = await context.Users.AnyAsync(
                u => u.Id != reserved.Id && u.Id != claimant.Id && u.Username.ToLower() == desired.ToLower(),
                cancellationToken);
            if (!taken)
            {
                reserved.Username = "_src_" + reserved.Id.ToString("N")[..12];
                await context.SaveChangesAsync(cancellationToken);
                claimant.Username = desired;
                if (!string.IsNullOrWhiteSpace(display)) claimant.DisplayName = display;
                tookHandle = true;
            }
        }

        var reservations = await context.UsernameReservations
            .Where(r => r.UserId == reserved.Id)
            .ToListAsync(cancellationToken);
        foreach (var row in reservations)
        {
            row.UserId = claimant.Id;
        }

        context.Users.Remove(reserved);
        await context.SaveChangesAsync(cancellationToken);
        return tookHandle;
    }

    private async Task MarkReservationsClaimedAsync(
        Guid claimantId, string? srcUserId, string method, CancellationToken cancellationToken)
    {
        var rows = await context.UsernameReservations
            .Where(r =>
                r.UserId == claimantId
                || (srcUserId != null && r.SrcUserId == srcUserId))
            .ToListAsync(cancellationToken);
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.ClaimedAt ??= now;
            row.ClaimedByUserId ??= claimantId;
            row.ClaimMethod ??= method;
            row.UserId = claimantId;
        }
    }
}
