using GodGamerGauntlet.Api.Models;
using GodGamerGauntlet.Api.Services;
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
    public DbSet<UserStreamLink> UserStreamLinks => Set<UserStreamLink>();
    public DbSet<UserFollow> UserFollows => Set<UserFollow>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Variable> Variables => Set<Variable>();
    public DbSet<VariableValue> VariableValues => Set<VariableValue>();
    public DbSet<Submission> Submissions => Set<Submission>();
    public DbSet<SubmissionVariable> SubmissionVariables => Set<SubmissionVariable>();
    public DbSet<GameModerator> GameModerators => Set<GameModerator>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<GameSrcLink> GameSrcLinks => Set<GameSrcLink>();
    public DbSet<UsernameReservation> UsernameReservations => Set<UsernameReservation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.Username).HasMaxLength(50).IsRequired();
            entity.HasIndex(u => u.Username).IsUnique();
            entity.Property(u => u.Email).HasMaxLength(254);
            entity.HasIndex(u => u.Email)
                .IsUnique()
                .HasFilter("\"Email\" IS NOT NULL");
            entity.Property(u => u.PasswordHash).HasMaxLength(500);
            entity.Property(u => u.IsAdmin).HasDefaultValue(false);
            entity.Property(u => u.IsReserved).HasDefaultValue(false);
            entity.Property(u => u.AvatarUrl).HasMaxLength(User.AvatarUrlMaxLength);
            entity.Property(u => u.DisplayName).HasMaxLength(User.DisplayNameMaxLength);
            entity.Property(u => u.SrcUserId).HasMaxLength(User.SrcUserIdMaxLength);
            entity.HasIndex(u => u.SrcUserId)
                .IsUnique()
                .HasFilter("\"SrcUserId\" IS NOT NULL");

            // A User has many Runs.
            entity.HasMany(u => u.Runs)
                  .WithOne(r => r.User)
                  .HasForeignKey(r => r.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(u => u.StreamLinks)
                  .WithOne(l => l.User)
                  .HasForeignKey(l => l.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserFollow>(entity =>
        {
            entity.HasIndex(f => new { f.FollowerId, f.FollowedId }).IsUnique();
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_UserFollows_NotSelf", "\"FollowerId\" <> \"FollowedId\""));

            entity.HasOne(f => f.Follower)
                  .WithMany(u => u.Following)
                  .HasForeignKey(f => f.FollowerId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(f => f.Followed)
                  .WithMany(u => u.Followers)
                  .HasForeignKey(f => f.FollowedId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserStreamLink>(entity =>
        {
            entity.Property(l => l.Id).ValueGeneratedNever();
            entity.Property(l => l.Platform)
                .HasMaxLength(UserStreamLink.PlatformMaxLength)
                .IsRequired();
            entity.Property(l => l.Url)
                .HasMaxLength(UserStreamLink.UrlMaxLength)
                .IsRequired();
            entity.HasIndex(l => new { l.UserId, l.SortOrder });
        });

        modelBuilder.Entity<Game>(entity =>
        {
            entity.Property(g => g.Title).HasMaxLength(200).IsRequired();
            entity.Property(g => g.ExternalId).HasMaxLength(50);
            entity.HasIndex(g => g.ExternalId).IsUnique();
            entity.Property(g => g.Thumb).HasMaxLength(500);
            entity.Property(g => g.NormalPrice).HasPrecision(10, 2);
            entity.Property(g => g.SalePrice).HasPrecision(10, 2);
            entity.Property(g => g.IsFeatured).HasDefaultValue(false);
            entity.Property(g => g.PopularityRank).HasDefaultValue(999999);
            // Backs the catalog's default featured-then-popularity ordering.
            entity.HasIndex(g => new { g.IsFeatured, g.PopularityRank });
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_Games_BaseDifficulty", "\"BaseDifficulty\" BETWEEN 1 AND 100"));
        });

        modelBuilder.Entity<Run>(entity =>
        {
            entity.Property(r => r.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(r => r.RunType)
                  .HasConversion<string>()
                  .HasMaxLength(20)
                  .HasDefaultValue(RunType.Standard);
            entity.Property(r => r.TimerStatus).HasMaxLength(20);
            entity.Property(r => r.OverlayKey).HasMaxLength(64);
            entity.Property(r => r.AttemptCode).HasMaxLength(AttemptCodes.MaxLength);
            entity.HasIndex(r => r.AttemptCode).IsUnique();
            // Leaderboards are ranked per run type.
            entity.HasIndex(r => r.RunType);

            // A Run has 10 RunSlots (Standard) or 5 (Lite).
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

        // ── Speedrun Records trust schema (Records Phase 1) ─────────────────
        // The rules engine (Category → Variable → VariableValue) cascades:
        // mods own it and may reshape it. The ledger (Submission) restricts:
        // verified history must never vanish because a rule object was deleted.

        modelBuilder.Entity<Category>(entity =>
        {
            entity.Property(c => c.Name)
                  .HasMaxLength(Category.NameMaxLength)
                  .IsRequired();
            entity.Property(c => c.SrcCategoryId).HasMaxLength(Category.SrcIdMaxLength);
            entity.HasIndex(c => c.SrcCategoryId)
                .IsUnique()
                .HasFilter("\"SrcCategoryId\" IS NOT NULL");
            // One "Any%" per game.
            entity.HasIndex(c => new { c.GameId, c.Name }).IsUnique();

            entity.HasOne(c => c.Game)
                  .WithMany()
                  .HasForeignKey(c => c.GameId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(c => c.Variables)
                  .WithOne(v => v.Category)
                  .HasForeignKey(v => v.CategoryId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Variable>(entity =>
        {
            entity.Property(v => v.Name)
                  .HasMaxLength(Variable.NameMaxLength)
                  .IsRequired();
            entity.Property(v => v.SrcVariableId).HasMaxLength(Variable.SrcIdMaxLength);
            entity.HasIndex(v => new { v.CategoryId, v.SrcVariableId })
                .IsUnique()
                .HasFilter("\"SrcVariableId\" IS NOT NULL");
            entity.HasIndex(v => new { v.CategoryId, v.Name }).IsUnique();

            entity.HasMany(v => v.Values)
                  .WithOne(x => x.Variable)
                  .HasForeignKey(x => x.VariableId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VariableValue>(entity =>
        {
            entity.Property(x => x.Value)
                  .HasMaxLength(VariableValue.ValueMaxLength)
                  .IsRequired();
            entity.Property(x => x.SrcValueId).HasMaxLength(VariableValue.SrcIdMaxLength);
            entity.HasIndex(x => new { x.VariableId, x.SrcValueId })
                .IsUnique()
                .HasFilter("\"SrcValueId\" IS NOT NULL");
            entity.HasIndex(x => new { x.VariableId, x.Value }).IsUnique();
        });

        modelBuilder.Entity<Submission>(entity =>
        {
            entity.Property(s => s.VideoUrl)
                  .HasMaxLength(Submission.VideoUrlMaxLength)
                  .IsRequired();
            entity.Property(s => s.RejectReason)
                  .HasMaxLength(Submission.RejectReasonMaxLength);
            entity.Property(s => s.Status)
                  .HasConversion<string>()
                  .HasMaxLength(20)
                  .HasDefaultValue(SubmissionStatus.Pending);
            entity.Property(s => s.Origin)
                  .HasConversion<string>()
                  .HasMaxLength(20)
                  .HasDefaultValue(SubmissionOrigin.Native);
            entity.Property(s => s.SrcRunId).HasMaxLength(Submission.SrcRunIdMaxLength);
            entity.HasIndex(s => s.SrcRunId)
                .IsUnique()
                .HasFilter("\"SrcRunId\" IS NOT NULL");
            entity.ToTable(t => t.HasCheckConstraint(
                "CK_Submissions_PrimaryTimeMs", "\"PrimaryTimeMs\" > 0"));
            entity.Property(s => s.IsObsolete).HasDefaultValue(false);

            // The leaderboard/PB query: current verified rows, fastest first.
            entity.HasIndex(s => new { s.CategoryId, s.Status, s.IsObsolete, s.PrimaryTimeMs });
            // Player PB lookups and profile history.
            entity.HasIndex(s => new { s.PlayerId, s.CategoryId });
            // The mod queue: pending runs for a game, oldest first.
            entity.HasIndex(s => new { s.GameId, s.Status, s.SubmittedAt });

            entity.HasOne(s => s.Game)
                  .WithMany()
                  .HasForeignKey(s => s.GameId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.Category)
                  .WithMany(c => c.Submissions)
                  .HasForeignKey(s => s.CategoryId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.Player)
                  .WithMany()
                  .HasForeignKey(s => s.PlayerId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.Examiner)
                  .WithMany()
                  .HasForeignKey(s => s.ExaminerId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<SubmissionVariable>(entity =>
        {
            entity.HasKey(x => new { x.SubmissionId, x.VariableValueId });

            // Deleting a submission drops its selections; the value itself is
            // ledger-referenced and cannot be deleted out from under history.
            entity.HasOne(x => x.Submission)
                  .WithMany(s => s.Variables)
                  .HasForeignKey(x => x.SubmissionId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.VariableValue)
                  .WithMany()
                  .HasForeignKey(x => x.VariableValueId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<GameModerator>(entity =>
        {
            entity.HasKey(m => new { m.GameId, m.UserId });

            // Assignments are permissions, not ledger: removing a game or user
            // may remove the grant. Decisions already made keep ExaminerId.
            entity.HasOne(m => m.Game)
                  .WithMany()
                  .HasForeignKey(m => m.GameId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(m => m.User)
                  .WithMany()
                  .HasForeignKey(m => m.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            // "Which games does this user moderate" — the queue query.
            entity.HasIndex(m => m.UserId);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(n => n.Message)
                  .HasMaxLength(Notification.MessageMaxLength)
                  .IsRequired();
            entity.Property(n => n.ActionUrl)
                  .HasMaxLength(Notification.ActionUrlMaxLength)
                  .IsRequired();
            entity.Property(n => n.IsRead).HasDefaultValue(false);

            // Alerts are ephemeral per-user state, not ledger.
            entity.HasOne(n => n.User)
                  .WithMany()
                  .HasForeignKey(n => n.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            // The inbox query: caller's notifications, newest first.
            entity.HasIndex(n => new { n.UserId, n.CreatedAt });
        });

        modelBuilder.Entity<GameSrcLink>(entity =>
        {
            entity.Property(l => l.SrcGameId)
                .HasMaxLength(GameSrcLink.SrcIdMaxLength)
                .IsRequired();
            entity.Property(l => l.SrcAbbreviation)
                .HasMaxLength(GameSrcLink.AbbreviationMaxLength)
                .IsRequired();
            entity.Property(l => l.SrcWeblink).HasMaxLength(GameSrcLink.WeblinkMaxLength);
            entity.Property(l => l.ImportEnabled).HasDefaultValue(true);
            entity.HasIndex(l => l.SrcGameId).IsUnique();
            entity.HasIndex(l => l.SrcAbbreviation).IsUnique();
            entity.HasIndex(l => l.GameId).IsUnique();

            entity.HasOne(l => l.Game)
                .WithMany()
                .HasForeignKey(l => l.GameId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UsernameReservation>(entity =>
        {
            entity.Property(r => r.ReservedUsername)
                .HasMaxLength(UsernameReservation.UsernameMaxLength)
                .IsRequired();
            entity.Property(r => r.SrcUserId).HasMaxLength(UsernameReservation.SrcIdMaxLength);
            entity.Property(r => r.GuestName).HasMaxLength(UsernameReservation.GuestNameMaxLength);
            entity.Property(r => r.ClaimMethod).HasMaxLength(UsernameReservation.ClaimMethodMaxLength);
            entity.HasIndex(r => r.UserId);

            entity.HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
