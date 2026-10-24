using System.Text.Json;
using System.Text.Json.Serialization;

namespace GodGamerGauntlet.Api.Services.Src;

public sealed class SrcDataEnvelope<T>
{
    public T? Data { get; set; }
}

public sealed class SrcEmbed<T>
{
    public T? Data { get; set; }
}

public sealed class SrcNames
{
    public string? International { get; set; }
}

public sealed class SrcGame
{
    public string? Id { get; set; }
    public string? Abbreviation { get; set; }
    public string? Weblink { get; set; }
    public SrcNames? Names { get; set; }
    public SrcEmbed<List<SrcCategory>>? Categories { get; set; }
    public SrcEmbed<List<SrcLevel>>? Levels { get; set; }
    public SrcEmbed<List<SrcVariable>>? Variables { get; set; }
    public SrcEmbed<List<SrcNamed>>? Platforms { get; set; }
    public SrcEmbed<List<SrcNamed>>? Regions { get; set; }
}

public sealed class SrcNamed
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public SrcNames? Names { get; set; }
}

public sealed class SrcLevel
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? Weblink { get; set; }
    public string? Rules { get; set; }
}

public sealed class SrcCategory
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? Type { get; set; }
    public string? Weblink { get; set; }
    public string? Rules { get; set; }
    public bool Miscellaneous { get; set; }
    public SrcPlayerCount? Players { get; set; }
}

public sealed class SrcPlayerCount
{
    public string? Type { get; set; }
    public int Value { get; set; }
}

public sealed class SrcVariable
{
    public string? Id { get; set; }
    public string? Name { get; set; }
    public string? Category { get; set; }
    public SrcVariableScope? Scope { get; set; }
    public bool Mandatory { get; set; }

    [JsonPropertyName("is-subcategory")]
    public bool IsSubcategory { get; set; }

    public SrcVariableValues? Values { get; set; }
}

public sealed class SrcVariableScope
{
    public string? Type { get; set; }
}

public sealed class SrcVariableValues
{
    public Dictionary<string, SrcVariableChoice>? Values { get; set; }
}

public sealed class SrcVariableChoice
{
    public string? Label { get; set; }
    public string? Rules { get; set; }
}

public sealed class SrcLeaderboard
{
    public string? Weblink { get; set; }
    public List<SrcLeaderboardRow>? Runs { get; set; }
}

public sealed class SrcLeaderboardRow
{
    public int Place { get; set; }
    public SrcRun? Run { get; set; }
}

public sealed class SrcPersonalBest
{
    public int Place { get; set; }
    public SrcRun? Run { get; set; }
}

public sealed class SrcRun
{
    public string? Id { get; set; }
    public string? Weblink { get; set; }
    public object? Game { get; set; }
    public object? Category { get; set; }
    public object? Level { get; set; }
    public string? Date { get; set; }
    public string? Submitted { get; set; }
    public SrcRunStatus? Status { get; set; }
    public SrcTimes? Times { get; set; }
    public SrcVideos? Videos { get; set; }
    public SrcSplits? Splits { get; set; }
    public SrcSystem? System { get; set; }

    /// <summary>Embedded platform. The id also stays on <see cref="SrcSystem.Platform"/>.</summary>
    public object? Platform { get; set; }

    /// <summary>Embedded region. The id also stays on <see cref="SrcSystem.Region"/>.</summary>
    public object? Region { get; set; }

    [JsonConverter(typeof(SrcPlayerListConverter))]
    public List<SrcPlayer>? Players { get; set; }
    public Dictionary<string, string>? Values { get; set; }
}

public sealed class SrcRunStatus
{
    public string? Status { get; set; }
    public string? Examiner { get; set; }
    public string? Reason { get; set; }

    [JsonPropertyName("verify-date")]
    public string? VerifyDate { get; set; }
}

public sealed class SrcTimes
{
    [JsonPropertyName("primary_t")]
    public double PrimaryT { get; set; }

    [JsonPropertyName("realtime_t")]
    public double? RealtimeT { get; set; }

    [JsonPropertyName("realtime_noloads_t")]
    public double? RealtimeNoloadsT { get; set; }

    [JsonPropertyName("ingame_t")]
    public double? IngameT { get; set; }
}

public sealed class SrcVideos
{
    public List<SrcVideoLink>? Links { get; set; }
}

public sealed class SrcVideoLink
{
    public string? Uri { get; set; }
}

public sealed class SrcSplits
{
    public string? Uri { get; set; }
}

public sealed class SrcSystem
{
    public object? Platform { get; set; }
    public object? Region { get; set; }
    public bool Emulated { get; set; }
}

public sealed class SrcPlayer
{
    public string? Rel { get; set; }
    public string? Id { get; set; }
    public string? Name { get; set; }
    public SrcNames? Names { get; set; }
}

public sealed class SrcUser
{
    public string? Id { get; set; }
    public SrcNames? Names { get; set; }
    public string? Weblink { get; set; }
}

/// <summary>
/// Run players are a list until embedded, when speedrun.com wraps them in data.
/// </summary>
public sealed class SrcPlayerListConverter : JsonConverter<List<SrcPlayer>>
{
    private static readonly JsonSerializerOptions PlayerJson = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public override List<SrcPlayer>? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        if (reader.TokenType == JsonTokenType.StartArray)
        {
            var list = new List<SrcPlayer>();
            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
            {
                list.Add(JsonSerializer.Deserialize<SrcPlayer>(ref reader, PlayerJson)!);
            }

            return list;
        }

        if (reader.TokenType == JsonTokenType.StartObject)
        {
            using var doc = JsonDocument.ParseValue(ref reader);
            if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            {
                return data.Deserialize<List<SrcPlayer>>(PlayerJson) ?? [];
            }

            return [];
        }

        throw new JsonException("speedrun.com players payload was not a list.");
    }

    public override void Write(Utf8JsonWriter writer, List<SrcPlayer> value, JsonSerializerOptions options) =>
        JsonSerializer.Serialize(writer, value, PlayerJson);
}

public static class SrcRunIds
{
    public static string? AsId(object? value)
    {
        if (value is null) return null;
        if (value is string s) return string.IsNullOrWhiteSpace(s) ? null : s;
        if (value is System.Text.Json.JsonElement el)
        {
            if (el.ValueKind == System.Text.Json.JsonValueKind.String) return el.GetString();
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object
                && el.TryGetProperty("id", out var id))
            {
                return id.GetString();
            }
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object
                && el.TryGetProperty("data", out var data)
                && data.ValueKind == System.Text.Json.JsonValueKind.Object
                && data.TryGetProperty("id", out var nested))
            {
                return nested.GetString();
            }
        }

        return value.ToString();
    }

    public static bool IsEmptyLevel(object? level)
    {
        if (level is null) return true;
        if (level is string s) return string.IsNullOrWhiteSpace(s);
        if (level is System.Text.Json.JsonElement el)
        {
            return el.ValueKind is System.Text.Json.JsonValueKind.Null
                or System.Text.Json.JsonValueKind.Undefined;
        }

        return false;
    }
}
