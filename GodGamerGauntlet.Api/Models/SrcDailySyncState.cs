namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// One row. The hosted worker sleeps until <see cref="NextRunUtc"/>, then
/// either backfills the capped boards or fetches the overlap window.
/// </summary>
public class SrcDailySyncState
{
    public const int RowId = 1;
    public const int ErrorMaxLength = 2000;

    public int Id { get; set; }

    /// <summary>The next midnight UTC the worker should run, or earlier when a night was missed.</summary>
    public DateTime NextRunUtc { get; set; }

    /// <summary>Start time of the last run that finished. Null until the first success.</summary>
    public DateTime? LastSuccessUtc { get; set; }

    public string? LastError { get; set; }

    /// <summary>
    /// False until the first success. That run fills slices which kept only
    /// their oldest 10,000 runs. Later nights skip that walk.
    /// </summary>
    public bool BackfillCompleted { get; set; }
}
