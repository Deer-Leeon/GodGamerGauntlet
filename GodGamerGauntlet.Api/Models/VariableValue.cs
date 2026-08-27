namespace GodGamerGauntlet.Api.Models;

/// <summary>One selectable option on a Variable ("Nintendo 64", "Glitchless").</summary>
public class VariableValue
{
    public const int ValueMaxLength = 100;

    public Guid Id { get; set; }

    public Guid VariableId { get; set; }

    public required string Value { get; set; }

    public Variable? Variable { get; set; }
}
