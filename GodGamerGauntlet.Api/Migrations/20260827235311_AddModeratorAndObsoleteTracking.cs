using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddModeratorAndObsoleteTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Submissions_CategoryId_Status_PrimaryTimeMs",
                table: "Submissions");

            migrationBuilder.AddColumn<bool>(
                name: "IsAdmin",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsObsolete",
                table: "Submissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "GameModerators",
                columns: table => new
                {
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameModerators", x => new { x.GameId, x.UserId });
                    table.ForeignKey(
                        name: "FK_GameModerators_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameModerators_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_CategoryId_Status_IsObsolete_PrimaryTimeMs",
                table: "Submissions",
                columns: new[] { "CategoryId", "Status", "IsObsolete", "PrimaryTimeMs" });

            migrationBuilder.CreateIndex(
                name: "IX_GameModerators_UserId",
                table: "GameModerators",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameModerators");

            migrationBuilder.DropIndex(
                name: "IX_Submissions_CategoryId_Status_IsObsolete_PrimaryTimeMs",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "IsAdmin",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsObsolete",
                table: "Submissions");

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_CategoryId_Status_PrimaryTimeMs",
                table: "Submissions",
                columns: new[] { "CategoryId", "Status", "PrimaryTimeMs" });
        }
    }
}
