using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRunAttemptCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttemptCode",
                table: "Runs",
                type: "character varying(8)",
                maxLength: 8,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Runs_AttemptCode",
                table: "Runs",
                column: "AttemptCode",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Runs_AttemptCode",
                table: "Runs");

            migrationBuilder.DropColumn(
                name: "AttemptCode",
                table: "Runs");
        }
    }
}
