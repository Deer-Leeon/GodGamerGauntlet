using System.ComponentModel.DataAnnotations;
using GodGamerGauntlet.Api.Models;

namespace GodGamerGauntlet.Api.Contracts;

public record CreateGameRequest(
    [Required, MaxLength(200)] string Title,
    [Range(1, 100)] int BaseDifficulty);

public record GameResponse(
    Guid Id,
    string Title,
    int BaseDifficulty,
    string? Thumb,
    decimal? NormalPrice,
    decimal? SalePrice,
    bool IsFeatured,
    int PopularityRank)
{
    public static GameResponse FromEntity(Game game) =>
        new(game.Id, game.Title, game.BaseDifficulty, game.Thumb, game.NormalPrice,
            game.SalePrice, game.IsFeatured, game.PopularityRank);
}

/// <summary>One page of the searchable catalog (records directory).</summary>
public record CatalogPageDto(
    IReadOnlyList<GameResponse> Items,
    int TotalCount,
    int TotalPages,
    int CurrentPage);
