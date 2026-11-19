using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;
using ExpensesManager.Data;

namespace ExpensesManager.Pages;

/// <summary>
/// Migration of the User_ReportsPage screen.
/// Source: NRNodes.WebScreen "User_ReportsPage" in ExpensesManager_Frontend.xml,
/// with its Aggregates GetExpenseReports and GetEarningReports, and the client
/// actions FilterExpenseReportListOnChange / FilterEarningReportListOnChange.
/// </summary>
public class ReportsModel : PageModel
{
    readonly AppDbContext _db;
    public ReportsModel(AppDbContext db) => _db = db;

    public record Item(DateOnly? Date, string? Title, string? Description, decimal Amount, string? Type);
    public record Row(long Id, string? Code, string? Title, DateOnly? Date, decimal Total, string Status, List<Item> Items);

    public string Kind { get; private set; } = "Expenses";
    public string StatusFilter { get; private set; } = "All";
    public long Expanded { get; private set; }
    public List<Row> Rows { get; private set; } = new();

    public void OnGet(string? kind, string? status, long expand = 0)
    {
        Kind = kind == "Earnings" ? "Earnings" : "Expenses";
        StatusFilter = status is "Draft" or "Submitted" or "Approved" or "Declined" ? status : "All";
        Expanded = expand;

        Rows = Kind == "Expenses" ? LoadExpenses() : LoadEarnings();
    }

    bool Keep(string status) => StatusFilter == "All" || status == StatusFilter;

    List<Row> LoadExpenses() =>
        _db.ExpenseReport
            .Include(r => r.Status)
            .Include(r => r.Expenses).ThenInclude(e => e.ExpenseType)
            .AsEnumerable()
            .Select(r => new Row(
                r.Id, r.Code, r.Title,
                r.Expenses.Min(e => e.Date) ?? DateOnly.FromDateTime(r.CreatedOn ?? DateTime.Today),
                r.Expenses.Sum(e => e.AmountInEuros ?? 0),
                r.Status?.Label ?? "Draft",
                r.Expenses.OrderBy(e => e.Date)
                    .Select(e => new Item(e.Date, e.Title, e.Description, e.AmountInEuros ?? 0, e.ExpenseType?.Label))
                    .ToList()))
            .Where(r => Keep(r.Status))
            .OrderByDescending(r => r.Date)
            .ToList();

    List<Row> LoadEarnings() =>
        _db.EarningReport
            .Include(r => r.Status)
            .Include(r => r.Earnings).ThenInclude(e => e.EarningType)
            .AsEnumerable()
            .Select(r => new Row(
                r.Id, r.Code, r.Title,
                r.Earnings.Count > 0 ? r.Earnings.Min(e => e.Date) : DateOnly.FromDateTime(r.CreatedOn ?? DateTime.Today),
                r.Earnings.Sum(e => e.AmountInEuros ?? 0),
                r.Status?.Label ?? "Draft",
                r.Earnings.OrderBy(e => e.Date)
                    .Select(e => new Item(e.Date, e.Title, e.Description, e.AmountInEuros ?? 0, e.EarningType?.Label))
                    .ToList()))
            .Where(r => Keep(r.Status))
            .OrderByDescending(r => r.Date)
            .ToList();
}
