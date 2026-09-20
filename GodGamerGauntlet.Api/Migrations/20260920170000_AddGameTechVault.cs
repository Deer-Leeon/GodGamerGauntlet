using System;
using GodGamerGauntlet.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(AppDbContext))]
    [Migration("20260920170000_AddGameTechVault")]
    public partial class AddGameTechVault : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GameTeches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameId = table.Column<Guid>(type: "uuid", nullable: false),
                    Slug = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Summary = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    BodyMarkdown = table.Column<string>(type: "text", nullable: true),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Difficulty = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PatchScope = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VersionNote = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    Prerequisites = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    Loadout = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Published"),
                    AuthorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameTeches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameTeches_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GameTeches_Users_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "GameTechClips",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TechId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    StartSeconds = table.Column<int>(type: "integer", nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameTechClips", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameTechClips_GameTeches_TechId",
                        column: x => x.TechId,
                        principalTable: "GameTeches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameTechVotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TechId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Value = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameTechVotes", x => x.Id);
                    table.CheckConstraint("CK_GameTechVotes_Value", "\"Value\" IN (-1, 1)");
                    table.ForeignKey(
                        name: "FK_GameTechVotes_GameTeches_TechId",
                        column: x => x.TechId,
                        principalTable: "GameTeches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameTechVotes_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "GameTechReports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TechId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "Pending"),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GameTechReports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GameTechReports_GameTeches_TechId",
                        column: x => x.TechId,
                        principalTable: "GameTeches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_GameTechReports_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GameTeches_AuthorUserId",
                table: "GameTeches",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_GameTeches_GameId_Slug",
                table: "GameTeches",
                columns: new[] { "GameId", "Slug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameTeches_GameId_Status_Kind",
                table: "GameTeches",
                columns: new[] { "GameId", "Status", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_GameTechClips_TechId_SortOrder",
                table: "GameTechClips",
                columns: new[] { "TechId", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_GameTechVotes_TechId_UserId",
                table: "GameTechVotes",
                columns: new[] { "TechId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GameTechVotes_UserId",
                table: "GameTechVotes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_GameTechReports_TechId",
                table: "GameTechReports",
                column: "TechId");

            migrationBuilder.CreateIndex(
                name: "IX_GameTechReports_UserId",
                table: "GameTechReports",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "GameTechClips");
            migrationBuilder.DropTable(name: "GameTechVotes");
            migrationBuilder.DropTable(name: "GameTechReports");
            migrationBuilder.DropTable(name: "GameTeches");
        }
    }
}
