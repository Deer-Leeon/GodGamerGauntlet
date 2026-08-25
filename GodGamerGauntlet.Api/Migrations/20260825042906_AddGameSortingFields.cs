using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGameSortingFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsFeatured",
                table: "Games",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PopularityRank",
                table: "Games",
                type: "integer",
                nullable: false,
                defaultValue: 999999);

            migrationBuilder.CreateIndex(
                name: "IX_Games_IsFeatured_PopularityRank",
                table: "Games",
                columns: new[] { "IsFeatured", "PopularityRank" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Games_IsFeatured_PopularityRank",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "IsFeatured",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "PopularityRank",
                table: "Games");
        }
    }
}
