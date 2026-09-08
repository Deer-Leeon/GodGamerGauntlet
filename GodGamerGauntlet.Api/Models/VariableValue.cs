namespace GodGamerGauntlet.Api.Models;

/// <summary>One selectable option on a Variable ("Nintendo 64", "Glitchless").</summary>
public class VariableValue
{
    public const int ValueMaxLength = 100;

    public const int SrcIdMaxLength = 16;

    public Guid Id { get; set; }

    public Guid VariableId { get; set; }

    public required string Value { get; set; }

    /// <summary>speedrun.com value id when imported.</summary>
    public string? SrcValueId { get; set; }

    public Variable? Variable { get; set; }
}
