using System.ComponentModel.DataAnnotations;

namespace GodGamerGauntlet.Api.Contracts;

public record ClaimSrcRequest([Required] string ApiKey);

public record ClaimSrcResponse(
    string Token,
    AccountDto User,
    string SrcUserId,
    int RunsImported,
    bool TookReservedHandle);

public record AdminGrantSrcRequest(
    [Required] string GggUsername,
    string? SrcUserId,
    string? ReservedUsername);

public record SrcImportResponse(
    int Games,
    int Categories,
    int RunsUpserted,
    int RunsSkipped,
    int PlayersReserved,
    IReadOnlyList<string> Notes);
