using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSrcImportCursor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "RealtimeNoloadsMs",
                table: "Submissions",
                type: "bigint",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SrcImportCursors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsStructure = table.Column<bool>(type: "boolean", nullable: false),
                    CategorySrcId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    LevelSrcId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PlatformSrcId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    RegionSrcId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Emulated = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Offset = table.Column<int>(type: "integer", nullable: false),
                    Completed = table.Column<bool>(type: "boolean", nullable: false),
                    Superseded = table.Column<bool>(type: "boolean", nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SrcImportCursors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SrcImportCursors_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SrcImportCursors_Completed_Superseded_IsStructure_UpdatedAt",
                table: "SrcImportCursors",
                columns: new[] { "Completed", "Superseded", "IsStructure", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SrcImportCursors_GameId_IsStructure_CategorySrcId_Status_Le~",
                table: "SrcImportCursors",
                columns: new[] { "GameId", "IsStructure", "CategorySrcId", "Status", "LevelSrcId", "PlatformSrcId", "RegionSrcId", "Emulated" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SrcImportCursors");

            migrationBuilder.DropColumn(
                name: "RealtimeNoloadsMs",
                table: "Submissions");
        }
    }
}
