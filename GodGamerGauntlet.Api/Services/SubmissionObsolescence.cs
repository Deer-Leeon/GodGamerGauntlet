using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Services;

/// <summary>
/// One live PB per player per board (category + subcategory value set).
/// Shared by the mod-queue verdict path and SRC import.
/// </summary>
public static class SubmissionObsolescence
{
    public static HashSet<Guid> SubcategoryKey(Submission submission) =>
        submission.Variables
            .Where(x => x.VariableValue?.Variable?.IsSubcategory == true)
            .Select(x => x.VariableValueId)
            .ToHashSet();

    public static string BoardKey(Submission submission)
    {
        var ids = SubcategoryKey(submission).OrderBy(id => id).Select(id => id.ToString("N"));
        return string.Join(',', ids);
    }

    /// <summary>
    /// Flags every verified run on this player's board except the fastest
    /// (time, then submitted-at) as obsolete.
    /// </summary>
    public static void RecomputePlayerBoard(IReadOnlyList<Submission> verifiedSamePlayerSameBoard)
    {
        var ordered = verifiedSamePlayerSameBoard
            .OrderBy(s => s.PrimaryTimeMs)
            .ThenBy(s => s.SubmittedAt)
            .ToList();
        for (var i = 0; i < ordered.Count; i++)
        {
            ordered[i].IsObsolete = i > 0;
        }
    }

    public static void RecomputeCategory(IEnumerable<Submission> verifiedInCategory)
    {
        foreach (var group in verifiedInCategory.GroupBy(s => (s.PlayerId, BoardKey(s))))
        {
            RecomputePlayerBoard(group.ToList());
        }
    }
}
