namespace GodGamerGauntlet.Api.Contracts;

public record GameTechClipDto(string Provider, string Url, int? StartSeconds);

public record GameTechCardDto(
    Guid Id,
    string Slug,
    string Title,
    string Kind,
    string Difficulty,
    string PatchScope,
    string? VersionNote,
    string Summary,
    string? BodyMarkdown,
    string? Prerequisites,
    string? Loadout,
    string Status,
    int Score,
    int MyVote,
    IReadOnlyList<GameTechClipDto> Clips);

public record GameTechReportRequest(string Kind, string? Note);

public record GameTechReportResponse(Guid Id, string Kind, string Status);
