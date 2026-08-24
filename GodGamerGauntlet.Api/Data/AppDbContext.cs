using GodGamerGauntlet.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace GodGamerGauntlet.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Game> Games => Set<Game>();
    public DbSet<Run> Runs => Set<Run>();
    public DbSet<RunSlot> RunSlots => Set<RunSlot>();
    public DbSet<RunVote> RunVotes => Set<RunVote>();
    public DbSet<RunComment> RunComments => Set<RunComment>();
    public DbSet<RunReaction> RunReactions => Set<RunReaction>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.Username).HasMaxLength(50).IsRequired();
            entity.HasIndex(u => u.Username).IsUnique();
            entity.Property(u => u.PasswordHash).HasMaxLength(500);

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

        modelBuilder.Entity<RunVote>(entity =>
        {
            // One vote per user per run; the value flips between +1 and -1.
            entity.HasIndex(v => new { v.RunId, v.UserId }).IsUnique();
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_RunVotes_Value", "\"Value\" IN (-1, 1)"));

            entity.HasOne(v => v.Run)
                  .WithMany(r => r.Votes)
                  .HasForeignKey(v => v.RunId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(v => v.User)
                  .WithMany()
                  .HasForeignKey(v => v.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RunComment>(entity =>
        {
            entity.Property(c => c.Body).HasMaxLength(1000).IsRequired();
            entity.HasIndex(c => new { c.RunId, c.CreatedAt });

            entity.HasOne(c => c.Run)
                  .WithMany(r => r.Comments)
                  .HasForeignKey(c => c.RunId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.User)
                  .WithMany()
                  .HasForeignKey(c => c.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RunReaction>(entity =>
        {
            entity.Property(x => x.Type).HasMaxLength(RunReaction.TypeMaxLength).IsRequired();
            // Each user can add each reaction type once per run (toggle semantics).
            entity.HasIndex(x => new { x.RunId, x.UserId, x.Type }).IsUnique();

            entity.HasOne(x => x.Run)
                  .WithMany(r => r.Reactions)
                  .HasForeignKey(x => x.RunId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.User)
                  .WithMany()
                  .HasForeignKey(x => x.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
