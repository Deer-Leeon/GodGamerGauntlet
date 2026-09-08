namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// How a ledger row entered the database. Native runs go through the mod
/// queue; SRC imports are already verified on speedrun.com.
/// </summary>
public enum SubmissionOrigin
{
    Native = 0,
    SrcImport = 1,
    SrcClaimImport = 2,
}
