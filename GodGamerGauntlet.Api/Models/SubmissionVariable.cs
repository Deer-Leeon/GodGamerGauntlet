namespace GodGamerGauntlet.Api.Models;

/// <summary>
/// Links a submission to one selected VariableValue (e.g. Platform = N64).
/// Composite PK (SubmissionId, VariableValueId) — a submission selects each
/// value at most once.
/// </summary>
public class SubmissionVariable
{
    public Guid SubmissionId { get; set; }

    public Guid VariableValueId { get; set; }

    public Submission? Submission { get; set; }

    public VariableValue? VariableValue { get; set; }
}
