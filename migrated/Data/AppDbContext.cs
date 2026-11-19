using Microsoft.EntityFrameworkCore;

namespace ExpensesManager.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> o) : base(o) { }

    public DbSet<Status> Status => Set<Status>();
    public DbSet<Currency> Currency => Set<Currency>();
    public DbSet<ExpenseType> ExpenseType => Set<ExpenseType>();
    public DbSet<EarningType> EarningType => Set<EarningType>();
    public DbSet<ExpenseReport> ExpenseReport => Set<ExpenseReport>();
    public DbSet<EarningReport> EarningReport => Set<EarningReport>();
    public DbSet<Expense> Expense => Set<Expense>();
    public DbSet<Earning> Earning => Set<Earning>();
    public DbSet<BlogPost> BlogPost => Set<BlogPost>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Indexes carried over from the source module. The two unique report-code
        // indexes are real business constraints, not incidental.
        //
        // Migration note: in the source module BOTH unique indexes are named
        // "UniqueIndex_ReportCode", one on ExpenseReport and one on EarningReport.
        // SQL Server scopes index names per table, so that is legal there. SQLite
        // and PostgreSQL scope them per database, so the names collide and the
        // second CREATE INDEX fails. Index names are prefixed with the table name
        // here. This is the kind of thing that only surfaces when the migrated
        // schema is actually executed.
        b.Entity<ExpenseReport>().HasIndex(x => x.Code).IsUnique().HasDatabaseName("ExpenseReport_UniqueIndex_ReportCode");
        b.Entity<EarningReport>().HasIndex(x => x.Code).IsUnique().HasDatabaseName("EarningReport_UniqueIndex_ReportCode");
        b.Entity<Expense>().HasIndex(x => x.ExpenseReportId).HasDatabaseName("Expense_AutoIndex_ExpenseReportId");
        b.Entity<Expense>().HasIndex(x => x.ExpenseTypeId).HasDatabaseName("Expense_AutoIndex_ExpenseTypeId");
        b.Entity<Earning>().HasIndex(x => x.EarningReportId).HasDatabaseName("Earning_AutoIndex_EarningReportId");
        b.Entity<Earning>().HasIndex(x => x.EarningTypeId).HasDatabaseName("Earning_AutoIndex_EarningTypeId");

        foreach (var e in new[] { typeof(Expense), typeof(Earning) })
        {
            b.Entity(e).Property("Amount").HasPrecision(19, 4);
            b.Entity(e).Property("AmountInEuros").HasPrecision(19, 4);
            b.Entity(e).Property("Distance").HasPrecision(37, 8);
        }

        b.Entity<Status>().HasData(
            new Status { Id = 1, Label = "Draft", Order = 2 },        // Order = 2 is a
            new Status { Id = 2, Label = "Submitted", Order = 2 },    // duplicate in the
            new Status { Id = 3, Label = "Approved", Order = 3 },     // source app; kept
            new Status { Id = 4, Label = "Declined", Order = 4 });
        b.Entity<Currency>().HasData(
            new Currency { Id = 1, Label = "Euro", Order = 1 },
            new Currency { Id = 2, Label = "Dollar", Order = 2 });
        b.Entity<ExpenseType>().HasData(
            new ExpenseType { Id = 1, Label = "Restaurant", Order = 1 },
            new ExpenseType { Id = 2, Label = "Travel", Order = 2 },
            new ExpenseType { Id = 3, Label = "Kilometers", Order = 3 },
            new ExpenseType { Id = 4, Label = "Other", Order = 4 });
        b.Entity<EarningType>().HasData(
            new EarningType { Id = 1, Label = "Salary", Order = 1 },
            new EarningType { Id = 2, Label = "Investment", Order = 2 },
            new EarningType { Id = 3, Label = "Service", Order = 3 },
            new EarningType { Id = 4, Label = "Other", Order = 4 });
    }
}
