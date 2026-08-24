using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Game> Games => Set<Game>();
    public DbSet<Run> Runs => Set<Run>();
    public DbSet<RunSlot> RunSlots => Set<RunSlot>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.Username).HasMaxLength(50).IsRequired();
            entity.HasIndex(u => u.Username).IsUnique();

            // A User has many Runs.
            entity.HasMany(u => u.Runs)
                  .WithOne(r => r.User)
                  .HasForeignKey(r => r.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Game>(entity =>
        {
            entity.Property(g => g.Title).HasMaxLength(200).IsRequired();
            entity.Property(g => g.ExternalId).HasMaxLength(50);
            entity.HasIndex(g => g.ExternalId).IsUnique();
            entity.Property(g => g.Thumb).HasMaxLength(500);
            entity.Property(g => g.NormalPrice).HasPrecision(10, 2);
            entity.Property(g => g.SalePrice).HasPrecision(10, 2);
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_Games_BaseDifficulty", "\"BaseDifficulty\" BETWEEN 1 AND 100"));
        });

        modelBuilder.Entity<Run>(entity =>
        {
            entity.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);

            // A Run has up to 10 RunSlots.
            entity.HasMany(r => r.Slots)
                  .WithOne(s => s.Run)
                  .HasForeignKey(s => s.RunId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RunSlot>(entity =>
        {
            entity.Property(s => s.Status).HasConversion<string>().HasMaxLength(20);
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_RunSlots_Position", "\"Position\" BETWEEN 1 AND 10"));

            // Each position occurs once per run.
            entity.HasIndex(s => new { s.RunId, s.Position }).IsUnique();

            // Each RunSlot references one Game.
            entity.HasOne(s => s.Game)
                  .WithMany()
                  .HasForeignKey(s => s.GameId)
                  .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
