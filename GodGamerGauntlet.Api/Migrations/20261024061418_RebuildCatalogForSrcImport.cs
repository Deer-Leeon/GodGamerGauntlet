using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class RebuildCatalogForSrcImport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop the old catalog and gauntlet runs so the new shape is the only data.
            // Accounts stay. The startup seed puts the game list back, empty of boards.
            migrationBuilder.Sql("""TRUNCATE TABLE "Games", "Runs" CASCADE;""");

            migrationBuilder.AddColumn<string>(
                name: "Rules",
                table: "VariableValues",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Scope",
                table: "Variables",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "IngameMs",
                table: "Submissions",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LevelId",
                table: "Submissions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlatformName",
                table: "Submissions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlatformSrcId",
                table: "Submissions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "RealtimeMs",
                table: "Submissions",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionName",
                table: "Submissions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionSrcId",
                table: "Submissions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SrcWeblink",
                table: "Submissions",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifierName",
                table: "Submissions",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerifierSrcId",
                table: "Submissions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Miscellaneous",
                table: "Categories",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PlayersType",
                table: "Categories",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PlayersValue",
                table: "Categories",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "Categories",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Weblink",
                table: "Categories",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GameLevels",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SrcLevelId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    Rules = table.Column<string>(type: "text", nullable: true),
                    Weblink = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameLevels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameLevels_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SubmissionPlayers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SrcUserId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    IsGuest = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubmissionPlayers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubmissionPlayers_Submissions_SubmissionId",
                        column: x => x.SubmissionId,
                        principalTable: "Submissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SubmissionPlayers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "SubmissionProofs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubmissionProofs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubmissionProofs_Submissions_SubmissionId",
                        column: x => x.SubmissionId,
                        principalTable: "Submissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_LevelId",
                table: "Submissions",
                column: "LevelId");

            migrationBuilder.CreateIndex(
                name: "IX_GameLevels_GameId",
                table: "GameLevels",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_GameLevels_SrcLevelId",
                table: "GameLevels",
                column: "SrcLevelId",
                unique: true,
                filter: "\"SrcLevelId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SubmissionPlayers_SubmissionId_SortOrder",
                table: "SubmissionPlayers",
                columns: new[] { "SubmissionId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_SubmissionPlayers_UserId",
                table: "SubmissionPlayers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SubmissionProofs_SubmissionId_SortOrder",
                table: "SubmissionProofs",
                columns: new[] { "SubmissionId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_Submissions_GameLevels_LevelId",
                table: "Submissions",
                column: "LevelId",
                principalTable: "GameLevels",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Submissions_GameLevels_LevelId",
                table: "Submissions");

            migrationBuilder.DropTable(
                name: "GameLevels");

            migrationBuilder.DropTable(
                name: "SubmissionPlayers");

            migrationBuilder.DropTable(
                name: "SubmissionProofs");

            migrationBuilder.DropIndex(
                name: "IX_Submissions_LevelId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "Rules",
                table: "VariableValues");

            migrationBuilder.DropColumn(
                name: "Scope",
                table: "Variables");

            migrationBuilder.DropColumn(
                name: "IngameMs",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "LevelId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "PlatformName",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "PlatformSrcId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "RealtimeMs",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "RegionName",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "RegionSrcId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "SrcWeblink",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "VerifierName",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "VerifierSrcId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "Miscellaneous",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "PlayersType",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "PlayersValue",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "Type",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "Weblink",
                table: "Categories");
        }
    }
}
