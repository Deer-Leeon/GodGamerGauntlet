using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GodGamerGauntlet.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOverlayTimerState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "SplitTimeMs",
                table: "RunSlots",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OverlayKey",
                table: "Runs",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "TimerElapsedMs",
                table: "Runs",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<string>(
                name: "TimerStatus",
                table: "Runs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "TimerUpdatedAt",
                table: "Runs",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SplitTimeMs",
                table: "RunSlots");

            migrationBuilder.DropColumn(
                name: "OverlayKey",
                table: "Runs");

            migrationBuilder.DropColumn(
                name: "TimerElapsedMs",
                table: "Runs");

            migrationBuilder.DropColumn(
                name: "TimerStatus",
                table: "Runs");

            migrationBuilder.DropColumn(
                name: "TimerUpdatedAt",
                table: "Runs");
        }
    }
}
