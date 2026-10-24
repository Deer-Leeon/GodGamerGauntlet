using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSrcDailySyncState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SrcDailySyncStates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    NextRunUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastSuccessUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    BackfillCompleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SrcDailySyncStates", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SrcDailySyncStates");
        }
    }
}
