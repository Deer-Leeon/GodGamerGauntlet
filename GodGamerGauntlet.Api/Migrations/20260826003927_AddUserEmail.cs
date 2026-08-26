using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "Users",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            // Accounts that signed up with an email-as-username keep that
            // address for login; they pick a public handle in settings.
            migrationBuilder.Sql(
                """
                UPDATE "Users"
                SET "Email" = LOWER("Username")
                WHERE "Username" LIKE '%@%'
                  AND "Email" IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true,
                filter: "\"Email\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_Email",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "Users");
        }
    }
}
