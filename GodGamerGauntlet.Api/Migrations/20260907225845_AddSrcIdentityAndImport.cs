using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSrcIdentityAndImport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SrcValueId",
                table: "VariableValues",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SrcVariableId",
                table: "Variables",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DisplayName",
                table: "Users",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsReserved",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SrcUserId",
                table: "Users",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Origin",
                table: "Submissions",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Native");

            migrationBuilder.AddColumn<string>(
                name: "SrcRunId",
                table: "Submissions",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SrcCategoryId",
                table: "Categories",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GameSrcLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    SrcGameId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SrcAbbreviation = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SrcWeblink = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    ImportEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameSrcLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameSrcLinks_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UsernameReservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReservedUsername = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SrcUserId = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    GuestName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReservedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClaimedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClaimedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClaimMethod = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UsernameReservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UsernameReservations_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VariableValues_VariableId_SrcValueId",
                table: "VariableValues",
                columns: new[] { "VariableId", "SrcValueId" },
                unique: true,
                filter: "\"SrcValueId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Variables_CategoryId_SrcVariableId",
                table: "Variables",
                columns: new[] { "CategoryId", "SrcVariableId" },
                unique: true,
                filter: "\"SrcVariableId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Users_SrcUserId",
                table: "Users",
                column: "SrcUserId",
                unique: true,
                filter: "\"SrcUserId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Submissions_SrcRunId",
                table: "Submissions",
                column: "SrcRunId",
                unique: true,
                filter: "\"SrcRunId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Categories_SrcCategoryId",
                table: "Categories",
                column: "SrcCategoryId",
                unique: true,
                filter: "\"SrcCategoryId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GameSrcLinks_GameId",
                table: "GameSrcLinks",
                column: "GameId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameSrcLinks_SrcAbbreviation",
                table: "GameSrcLinks",
                column: "SrcAbbreviation",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameSrcLinks_SrcGameId",
                table: "GameSrcLinks",
                column: "SrcGameId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UsernameReservations_UserId",
                table: "UsernameReservations",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GameSrcLinks");

            migrationBuilder.DropTable(
                name: "UsernameReservations");

            migrationBuilder.DropIndex(
                name: "IX_VariableValues_VariableId_SrcValueId",
                table: "VariableValues");

            migrationBuilder.DropIndex(
                name: "IX_Variables_CategoryId_SrcVariableId",
                table: "Variables");

            migrationBuilder.DropIndex(
                name: "IX_Users_SrcUserId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Submissions_SrcRunId",
                table: "Submissions");

            migrationBuilder.DropIndex(
                name: "IX_Categories_SrcCategoryId",
                table: "Categories");

            migrationBuilder.DropColumn(
                name: "SrcValueId",
                table: "VariableValues");

            migrationBuilder.DropColumn(
                name: "SrcVariableId",
                table: "Variables");

            migrationBuilder.DropColumn(
                name: "DisplayName",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsReserved",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "SrcUserId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Origin",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "SrcRunId",
                table: "Submissions");

            migrationBuilder.DropColumn(
                name: "SrcCategoryId",
                table: "Categories");
        }
    }
}
