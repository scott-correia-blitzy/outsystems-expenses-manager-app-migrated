using Microsoft.EntityFrameworkCore;
using ExpensesManager.Data;

namespace ExpensesManager.Services;

public record TypeSlice(string Label, int Count, decimal Total, decimal Percent);
public record DailyPoint(DateOnly Date, string Type, decimal Amount);
public record StatusCount(string Label, int Count);

public class DashboardStats
{
    public decimal TotalBalance { get; init; }
    public decimal SpentCurrentMonth { get; init; }
    public decimal SpentLastMonth { get; init; }
    public decimal EarnedCurrentMonth { get; init; }
    public decimal PercentVsLastMonth { get; init; }
    public bool HasDrafts { get; init; }
    public List<TypeSlice> ExpensesPerType { get; init; } = new();
    public List<TypeSlice> EarningsPerType { get; init; } = new();
    public List<StatusCount> StatusSummary { get; init; } = new();
}

/// <summary>
/// Migration of the OutSystems reporting logic.
///
/// Each method below names the Aggregate or Server Action it replaces. Those names
/// come from legacy-oml-xml/ExpensesManager_Frontend.xml, so each one can be traced
/// back to the source module.
///
/// A Draft report is excluded from every total. That rule is implicit in the original
/// app, which shows the banner "You have reports with Draft status, this reports are
/// not considered for statistics".
/// </summary>
public class ReportingService
{
    readonly AppDbContext _db;
    public ReportingService(AppDbContext db) => _db = db;

    const int Draft = (int)StatusId.Draft;

    // Aggregate: GetExpensesTotalSum
    IQueryable<Expense> CountedExpenses =>
        _db.Expense.Where(e => e.ExpenseReport!.StatusId != Draft);

    // Aggregate: GetEarningsTotalSum
    IQueryable<Earning> CountedEarnings =>
        _db.Earning.Where(e => e.EarningReport!.StatusId != Draft);

    public DashboardStats GetDashboard(DateTime asOf)
    {
        var curStart = new DateOnly(asOf.Year, asOf.Month, 1);
        var curEnd = curStart.AddMonths(1).AddDays(-1);
        var lastStart = curStart.AddMonths(-1);
        var lastEnd = curStart.AddDays(-1);

        decimal Sum(IQueryable<Expense> q) => q.Sum(x => x.AmountInEuros ?? 0);

        var totalExpenses = Sum(CountedExpenses);
        var totalEarnings = CountedEarnings.Sum(x => x.AmountInEuros ?? 0);

        // Aggregate: GetExpensesCurrentMonthSum
        var curSpend = Sum(CountedExpenses.Where(e => e.Date >= curStart && e.Date <= curEnd));
        // Aggregate: GetExpensesLastMonthSum
        var lastSpend = Sum(CountedExpenses.Where(e => e.Date >= lastStart && e.Date <= lastEnd));
        // Aggregate: GetEarningsCurrentMonthSum
        var curEarn = CountedEarnings.Where(e => e.Date >= curStart && e.Date <= curEnd)
                                     .Sum(x => x.AmountInEuros ?? 0);

        var pct = lastSpend == 0 ? 0 : (curSpend - lastSpend) / lastSpend * 100m;

        // Aggregate: GetExpenseTypeAndCount
        var exByType = CountedExpenses
            .GroupBy(e => e.ExpenseType!.Label)
            .Select(g => new { Label = g.Key, Count = g.Count(), Total = g.Sum(x => x.AmountInEuros ?? 0) })
            .ToList();

        // Aggregate: GetEarningsTypeAndCount
        var earnByType = CountedEarnings
            .GroupBy(e => e.EarningType!.Label)
            .Select(g => new { Label = g.Key, Count = g.Count(), Total = g.Sum(x => x.AmountInEuros ?? 0) })
            .ToList();

        List<TypeSlice> Slices(IEnumerable<dynamic> rows, decimal denom) =>
            rows.Select(r => new TypeSlice((string)r.Label, (int)r.Count, (decimal)r.Total,
                                           denom == 0 ? 0 : (decimal)r.Total / denom * 100m))
                .OrderByDescending(s => s.Total).ToList();

        // Status summary across both report kinds, ordered by the Static Entity Order
        // then Id, which is how OutSystems orders Static Entity records by default.
        var statuses = _db.Status.OrderBy(s => s.Order).ThenBy(s => s.Id).ToList();
        var exStatus = _db.ExpenseReport.GroupBy(r => r.StatusId).Select(g => new { g.Key, N = g.Count() }).ToList();
        var eaStatus = _db.EarningReport.GroupBy(r => r.StatusId).Select(g => new { g.Key, N = g.Count() }).ToList();
        var summary = statuses.Select(s => new StatusCount(s.Label,
                exStatus.Where(x => x.Key == s.Id).Sum(x => x.N) +
                eaStatus.Where(x => x.Key == s.Id).Sum(x => x.N)))
            .Where(x => x.Count > 0).ToList();

        return new DashboardStats
        {
            TotalBalance = totalEarnings - totalExpenses,
            SpentCurrentMonth = curSpend,
            SpentLastMonth = lastSpend,
            EarnedCurrentMonth = curEarn,
            PercentVsLastMonth = pct,
            HasDrafts = _db.ExpenseReport.Any(r => r.StatusId == Draft) || _db.EarningReport.Any(r => r.StatusId == Draft),
            ExpensesPerType = Slices(exByType, totalExpenses),
            EarningsPerType = Slices(earnByType, totalEarnings),
            StatusSummary = summary,
        };
    }

    /// <summary>
    /// Migration of the one hand-written SQL node in the source module
    /// (Nodes.AdvancedQuery "SQL1" in ExpensesManager_Frontend.xml).
    ///
    /// The original is SQL Server and reads, with entity and parameter references
    /// resolved from the XML:
    ///
    ///   SELECT
    ///       CASE
    ///           WHEN Entity = 'Expense' THEN 'Expense'
    ///           WHEN Entity = 'Earning' THEN 'Earning'
    ///       END AS Type,
    ///       Date,
    ///       AmountInEuros
    ///   FROM
    ///       (SELECT 'Expense' AS Entity, [Date], [AmountInEuros] FROM {Expense}
    ///          WHERE [CreatedBy] = @UserId AND [Date] >= DATEADD(day, -30, GETDATE())
    ///        UNION ALL
    ///        SELECT 'Earning' AS Entity, [Date], [AmountInEuros] FROM {Earning}
    ///          WHERE [CreatedBy] = @UserId AND [Date] >= DATEADD(day, -30, GETDATE())
    ///       ) AS CombinedData
    ///   WHERE Date >= DATEADD(day, -30, GETDATE())
    ///
    /// Kept as raw SQL rather than folded into LINQ, so the migration of a SQL node
    /// stays visible and reviewable. Two dialect changes for SQLite: DATEADD/GETDATE
    /// become date('now', '-30 days'), and the demo passes an explicit as-of date
    /// because the sample data is from 2024.
    /// </summary>
    public const string OriginalSqlServer = """
        SELECT
            CASE
                WHEN Entity = 'Expense' THEN 'Expense'
                WHEN Entity = 'Earning' THEN 'Earning'
            END AS Type,
            Date,
            AmountInEuros
        FROM
            (SELECT 'Expense' AS Entity, [Date], [AmountInEuros] FROM [Expense]
               WHERE [CreatedBy] = @UserId AND [Date] >= DATEADD(day, -30, GETDATE())
             UNION ALL
             SELECT 'Earning' AS Entity, [Date], [AmountInEuros] FROM [Earning]
               WHERE [CreatedBy] = @UserId AND [Date] >= DATEADD(day, -30, GETDATE())
            ) AS CombinedData
        WHERE Date >= DATEADD(day, -30, GETDATE())
        """;

    public const string MigratedSqlite = """
        SELECT Type, Date, AmountInEuros FROM (
            SELECT 'Expense' AS Type, Date, AmountInEuros FROM Expense
              WHERE CreatedBy = $userId AND Date >= date($asOf, '-30 days')
            UNION ALL
            SELECT 'Earning' AS Type, Date, AmountInEuros FROM Earning
              WHERE CreatedBy = $userId AND Date >= date($asOf, '-30 days')
        ) ORDER BY Date
        """;

    public List<DailyPoint> GetLast30Days(long userId, DateTime asOf)
    {
        var rows = new List<DailyPoint>();
        using var cmd = _db.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = MigratedSqlite;
        AddParam(cmd, "$userId", userId);
        AddParam(cmd, "$asOf", asOf.ToString("yyyy-MM-dd"));
        if (cmd.Connection!.State != System.Data.ConnectionState.Open) cmd.Connection.Open();
        using var r = cmd.ExecuteReader();
        while (r.Read())
        {
            rows.Add(new DailyPoint(DateOnly.Parse(r.GetString(1)[..10]), r.GetString(0), r.GetDecimal(2)));
        }
        return rows;
    }

    static void AddParam(System.Data.Common.DbCommand cmd, string name, object value)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        cmd.Parameters.Add(p);
    }
}
